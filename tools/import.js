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
  'Cases': Number
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
  fs.writeFile(path.join('site', 'data', 'data.json'), JSON.stringify(data, null, 2), (err) => {
    if (err) {
      console.error('Failed to write data: %s', err);
    }
    else {
      console.log('Data written successfully');
    }
  });
}

let locations = {};
let days = {};
let data = null;

let filesToRead = 0;
function handleComplete() {
  filesToRead--;
  if (filesToRead === 0) {
    for (let day in data.days) {
      for (let location in data.days[day]) {
        data.days[day][location].active = data.days[day][location].cases - data.days[day][location].recovered - data.days[day][location].deaths;
      }
    }

    // Turn locations into an array
    let locationArray = [];
    let locationIds = {};
    let locationObject = data.locations;
    for (let location in locationObject) {
      locationIds[location] = locationArray.push(locationObject[location]) - 1;
    }
    data.locations = locationArray;

    // Reference indexes in the array instead of location names
    for (let day in data.days) {
      let dayObject = {};
      for (let location in data.days[day]) {
        let locationId = locationIds[location];
        dayObject[locationId] = data.days[day][location]; 
      }
      data.days[day] = dayObject;
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
      let location = {};
      dataItems.forEach(item => location[item] = normalizeString(row[item]));
      location.Lat = parseFloat(location.Lat);
      location.Long = parseFloat(location.Long);

      let locationName = getLocationName(location);
      locations[locationName] = location;

      // Store each day
      for (let day of Object.keys(row).filter(column => dataItems.indexOf(column) === -1)) {
        days[day] = days[day] || {};
        days[day][locationName] = days[day][locationName] || {};
        days[day][locationName][type] = parseInt(row[day], 10);
      }
    })
    .on('end', () => {
      data = {
        days: days,
        locations: locations
      };

      handleComplete();
    });
}

const csvPath = path.join('COVID-19', 'csse_covid_19_data', 'csse_covid_19_time_series');

readCSV(path.join(csvPath, 'time_series_19-covid-Confirmed.csv'), 'cases');
readCSV(path.join(csvPath, 'time_series_19-covid-Deaths.csv'), 'deaths');
readCSV(path.join(csvPath, 'time_series_19-covid-Recovered.csv'), 'recovered');
