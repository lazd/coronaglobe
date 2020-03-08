const csv = require('csv-parse');
const fs = require('fs');
const path = require('path');

// The path that contains CSV files to process
const csvDir = path.join('COVID-19', 'csse_covid_19_data', 'csse_covid_19_time_series');

let csvFiles = {
  'cases': 'time_series_19-covid-Confirmed.csv',
  'deaths': 'time_series_19-covid-Deaths.csv',
  'recovered': 'time_series_19-covid-Recovered.csv'
};

// The list of non-date data items in each row
let dataItems = [
  'Province/State',
  'Country/Region',
  'Lat',
  'Long'
];

/* Clean up strings in dataset */
function normalizeString(string) {
  if (string === 'None') {
    return '';
  }
  return string.trim();
}

/* Turn a row into a location entry */
function getLocationFromRow(row) {
  let location = {
    province: normalizeString(row['Province/State']),
    country: normalizeString(row['Country/Region']),
    coordinates: [parseFloat(row.Long), parseFloat(row.Lat)]
  };

  // This makes sure we treat these places as proper countries
  if (location.province === location.country) {
    delete location.province;
  }

  if (typeof location.province === 'string' && location.province.trim() === '') {
    delete location.province;
  }

  location.name = getLocationName(location);

  return location;
}

/* Get the full location name */
function getLocationName(location) {
  if (location.province === location.country) {
    return location.country;
  }

  return (location.province ? location.province + ', ' : '') + location.country;
}

function generateCasesByLocation() {
  let locationsByName = {};
  let locationDays = {};

  function readCSV(csvFileName, type) {
    let csvFilePath = path.join(csvDir, csvFileName);

    return new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv({
          columns: true
        }))
        .on('data', (row) => {
          // Store location by name
          let location = getLocationFromRow(row);
          locationsByName[location.name] = location;

          // Store each day
          for (let day of Object.keys(row).filter(column => dataItems.indexOf(column) === -1)) {
            locationDays[day] = locationDays[day] || {};
            locationDays[day][location.name] = locationDays[day][location.name] || {};

            let cases = parseInt(row[day], 10);
            locationDays[day][location.name][type] = cases;
          }
        })
        .on('end', () => {
          console.log('  ✅ Processed %s from %s', type, csvFileName);
          resolve(locationDays);
        })
        .on('error', reject);
    });
  }

  return new Promise((resolve, reject) => {
    console.log('⏳ Generating cases by location...');

    let promises = [];
    for (let [type, csvFileName] of Object.entries(csvFiles)) {
      promises.push(readCSV(csvFileName, type));
    }

    return Promise.all(promises)
      .then(() => {
        // Calculate the number of active cases
        for (let day in locationDays) {
          for (let location in locationDays[day]) {
            locationDays[day][location].active = locationDays[day][location].cases - locationDays[day][location].recovered - locationDays[day][location].deaths;
          }
        }

        // Turn locationsByName into an array
        let locationIds = {};
        let locations = [];
        let locationObject = locationsByName;
        for (let location in locationObject) {
          locationIds[location] = locations.push(locationObject[location]) - 1;
          locationObject[location].id = locationIds[location];
        }

        // Reference indexes in the array instead of location names
        for (let day in locationDays) {
          let dayObject = {};
          for (let location in locationDays[day]) {
            let locationId = locationIds[location];
            dayObject[locationId] = locationDays[day][location]; 
          }
          locationDays[day] = dayObject;
        }

        console.log('✅ Cases and locations generated');
        resolve({ locationDays, locations });
      });
  });
}

module.exports = generateCasesByLocation;
