const csv = require('csv-parse');
const fs = require('fs');
const path = require('path');

const csvPath = path.join('..', 'COVID-19', 'csse_covid_19_data', 'csse_covid_19_time_series', 'time_series_19-covid-Confirmed.csv');

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
  days: [Day]
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
  return string;
}

let locations = [];
let days = {};

fs.createReadStream(csvPath)
  .pipe(csv({
    columns: true
  }))
  .on('data', (row) => {
    // Store location
    let location = {};
    dataItems.forEach(item => location[item] = normalizeString(row[item]));
    let locationId = locations.push(location) - 1;
    location.id = locationId;

    // Store each day
    for (let day of Object.keys(row).filter(column => dataItems.indexOf(column) === -1)) {
      days[day] = days[day] || [];
      days[day].push({
        id: locationId,
        cases: row[day]
      });
    }
  })
  .on('end', () => {
    let data = {
      days: days,
      locations: locations
    };
    fs.writeFile(path.join('..', 'data', 'data.json'), JSON.stringify(data), (err) => {
      if (err) {
        console.error('Failed to write data: %s', err);
      }
      else {
        console.log('Data written successfully');
      }
    });
  });
