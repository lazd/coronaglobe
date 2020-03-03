const csv = require('csv-parse');
const fs = require('fs');
const path = require('path');

// The list of non-date data items in each row
let dataItems = [
  'Province/State',
  'Country/Region',
  'Lat',
  'Long'
];


/*
data
{
  days: {Day}
  locations: [Location]
}

Day
{
  date: Date,
  cases: [Number]
}

Location
{
  'Province/State': String,
  'Country/Region': String,
  'Lat': Number,
  'Long': Number,
  'cases': Number
}
*/

/* Clean up strings in dataset */
function normalizeString(string) {
  if (string === 'None') {
    return '';
  }
  return string.trim();
}

function getLocationName(location) {
  return (location['Province/State'] ? location['Province/State'] + ', ' : '') + location['Country/Region'];
}

function writeData() {
  fs.writeFile(path.join('site', 'data', 'cases.json'), JSON.stringify(days, null, 2), (err) => {
    if (err) {
      console.error('❌ Failed to write case data: %s', err);
      process.exit(1);
    }
    else {
      console.log('✅ Case data written successfully');
      fs.writeFile(path.join('site', 'data', 'locations.json'), JSON.stringify(locationArray, null, 2), (err) => {
        if (err) {
          console.error('❌ Failed to write location data: %s', err);
          process.exit(1);
        }
        else {
          console.log('✅ Location data written successfully');
        }
      });
    }
  });
}

let locations = {};
let locationArray = [];
let days = {};
let data = null;

let filesToRead = 0;
function handleComplete() {
  filesToRead--;
  if (filesToRead === 0) {
    for (let day in days) {
      for (let location in days[day]) {
        days[day][location].active = days[day][location].cases - days[day][location].recovered - days[day][location].deaths;
      }
    }

    // Turn locations into an array
    let locationIds = {};
    let locationObject = locations;
    for (let location in locationObject) {
      locationIds[location] = locationArray.push(locationObject[location]) - 1;
    }

    // Reference indexes in the array instead of location names
    for (let day in days) {
      let dayObject = {};
      for (let location in days[day]) {
        let locationId = locationIds[location];
        dayObject[locationId] = days[day][location]; 
      }
      days[day] = dayObject;
    }

    writeData();
  }
}

function readCSV(csvPath, type) {
  filesToRead++;

  fs.createReadStream(csvPath)
    .pipe(csv({
      columns: true
    }))
    .on('data', (row) => {
      // Store location by name
      let location = {
        province: normalizeString(row['Province/State']),
        country: normalizeString(row['Country/Region']),
        coordinates: [parseFloat(row.Long), parseFloat(row.Lat)]
      };

      let locationName = getLocationName(row);
      locations[locationName] = location;

      // Store each day
      for (let day of Object.keys(row).filter(column => dataItems.indexOf(column) === -1)) {
        days[day] = days[day] || {};
        days[day][locationName] = days[day][locationName] || {};
        days[day][locationName][type] = parseInt(row[day], 10);
      }
    })
    .on('end', () => {
      handleComplete();
    });
}

const csvPath = path.join('COVID-19', 'csse_covid_19_data', 'csse_covid_19_time_series');

console.log('⏳ Importing data...');
readCSV(path.join(csvPath, 'time_series_19-covid-Confirmed.csv'), 'cases');
readCSV(path.join(csvPath, 'time_series_19-covid-Deaths.csv'), 'deaths');
readCSV(path.join(csvPath, 'time_series_19-covid-Recovered.csv'), 'recovered');
