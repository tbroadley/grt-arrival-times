var gtfs = require('gtfs-stream');
var request = require('request');

var STOP_IDS = ['2513', '2523'];

request.get('https://www.regionofwaterloo.ca/opendatadownloads/GRT_GTFS.zip')
  .pipe(gtfs())
  .on('data', (entity) => {
    switch (entity.type) {
      case 'stop_time':
        if (STOP_IDS.includes(entity.data.stop_id)) {
          console.log(entity);
        }
        break;
    }
  })
  .on('finish', () => {
    request.get('http://192.237.29.212:8080/gtfsrealtime/TripUpdates')
      .pipe(gtfs.rt())
      .on('data', (entity) => {
        console.log(entity);
      });
  });
