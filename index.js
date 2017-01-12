const https = require('https');
const querystring = require('querystring');
const util = require('util');

const TOKEN = process.env.SLACK_TOKEN;

// seconds since epoch
const dateNow = Math.floor((new Date().getTime()) / 1000);

const minLargeFileSize = 1024 * 1024; // 1 MB
const minDaysOld = 90;
const minDaysVeryOld = 180;

function filesDelete(file) {
  const query = querystring.stringify({ token: TOKEN, file });
  const options = {
    hostname: 'slack.com',
    port: 443,
    path: `/api/files.delete?${query}`,
    method: 'GET'
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk.toString('utf8');
      });

      res.on('end', () => {
        const dataJson = JSON.parse(data);

        if (dataJson.ok) {
          resolve(dataJson);
        } else {
          reject(dataJson);
        }
      });
    });

    req.end();
  });
};

function filesList(opts = {}) {
  const query = querystring.stringify(Object.assign({
    token: TOKEN
  }, opts));

  const options = {
    hostname: 'slack.com',
    port: 443,
    path: `/api/files.list?${query}`,
    method: 'GET'
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk.toString('utf8');
      });

      res.on('end', () => {
        const dataJson = JSON.parse(data);

        if (dataJson.ok) {
          resolve(dataJson);
        } else {
          reject(dataJson);
        }
      });
    });

    req.end();
  });
}

function daysBeforeNow(date) {
  return Math.floor((dateNow - date) / 60 / 60 / 24);
}

function isFileOld(file) {
  return daysBeforeNow(file.timestamp) > minDaysOld;
}

function isFileVeryOld(file) {
  return daysBeforeNow(file.timestamp) > minDaysVeryOld;
}

function isFileLarge(file) {
  return file.size > minLargeFileSize;
}

function isFileGif(file) {
  return file.filetype === 'gif';
}

function prettySize(bytes) {
  return (Math.floor(bytes / 1024 / 1024 * 100) / 100) + ' MB'
}

function toDate(seconds) {
  const d = new Date(0);
  d.setUTCSeconds(seconds);
  return d;
}

function loadFilesList(opts = {}) {
  return filesList(opts)
    .then((data) => {
      console.log('Files List: page=%s, files=%s', JSON.stringify(data.paging), data.files.length);

      return Promise
        .all(data.files.map((file) => {
          if (isFileOld(file) && isFileLarge(file) || isFileVeryOld(file)) {
            return filesDelete(file.id)
              .then(res => {
                filesDeleted += 1;
                fileSizeDeleted += file.size;
                console.log('Deleted File (%s) age=%d size=%s', file.name, daysBeforeNow(file.timestamp), prettySize(file.size));
              })
              .catch(err => {
                console.error('ERROR deleting file:', err);
              });
          }
        }))
        .then(() => {
          if (data.paging.page < data.paging.pages) {
            return loadFilesList({ page: data.paging.page + 1 });
          }
        });
    });
}

let filesDeleted = 0;
let fileSizeDeleted = 0;
loadFilesList()
  .then(() => {
    console.log(util.format('Files deleted: count=%d size=%s', filesDeleted, prettySize(fileSizeDeleted)));
  });
