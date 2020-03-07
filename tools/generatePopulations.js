const fs = require('fs');
const path = require('path');

const parse = require('csv-parse/lib/sync')
const locations = require('../site/data/locations.json');
const features = require('../site/data/features.json');

const dataPath = path.join('data');

function readCSVSync(csvPath) {
  let source = parse(fs.readFileSync(path.resolve(dataPath, csvPath)), {
    columns: true
  });
  let obj = {};
  for (let item of source) {
    if (item.population) {
      obj[item.name] = parseInt(item.population, 10);
    }
    else {
      console.error('Invalid data in %s for %s', csvPath, item.name);
      process.exit(1);
    }
  }
  return obj;
}

let populationByProvince = {
  'Mainland China': readCSVSync('population-chinese-admin-divisions.csv'),
  'Australia': readCSVSync('population-australia-states.csv'),
  'Canada': readCSVSync('population-canada-provinces.csv')
};

// Store by abbrevations so features can find population data
populationByProvince.CN = populationByProvince['Mainland China'];
populationByProvince.CA = populationByProvince['Canada'];
populationByProvince.AUS = populationByProvince['Australia'];

let usPopulation = {
  'state': readCSVSync('population-us-states.csv'),
  'county': readCSVSync('population-us-counties.csv')
};

let supplementalPopulation = readCSVSync('population-supplemental.csv');

function getLocationName(location) {
  return (location.province ? location.province + ', ' : '') + location.country;
}

// Use data from features
let populationByCountry = {};
for (let feature of features.features) {
  if (feature.properties.pop_est) {
    populationByCountry[feature.properties.name] = feature.properties.pop_est;
    if (feature.properties.name_en) {
      populationByCountry[feature.properties.name_en] = feature.properties.pop_est;
    }
    if (feature.properties.abbrev) {
      populationByCountry[feature.properties.abbrev.replace(/\./g, '')] = feature.properties.pop_est;
    }
  }
  else {
    let population = getPopulation(feature.properties.iso_a2, feature.properties.name);

    if (population) {
      console.log('  ✅ %s: %d', feature.properties.name, population);
      feature.properties.pop_est = population;
    }
  }
}

function getPopulation(country, province) {
  let population = null;

  // Try population data by region
  if (country && province) {
    if (country === 'US') {
      if (usPopulation.county[province]) {
        // Try counties
        population = usPopulation.county[province];
      }
      else if (usPopulation.state[province]) {
        // Try states
        population = usPopulation.state[province];
      }
    }
    else {
      let populationData = populationByProvince[country];
      if (populationData) {
        population = populationData[province];
      }
    }
  }

  // Try population by country
  if (!province || province === country) {
    population = populationByCountry[country];
  }

  if (!population) {
    population = supplementalPopulation[province];
  }

  if (!population) {
    population = supplementalPopulation[country];
  }

  return population;
}

let populationFound = 0;
for (let locationId in locations) {
  let location = locations[locationId];
  let population = getPopulation(location.country, location.province);

  if (!population) {
    console.error('  ❌ %s: ?', getLocationName(location));
  }
  else {
    location.population = population;
    console.log('  ✅ %s: %s', getLocationName(location), population);

    if (location.featureId) {
      let feature = features.features[location.featureId];
      if (feature && feature.properties.name === location.province) {
        if (!feature.properties.pop_est) {
          feature.properties.pop_est = population;
          console.log('      + added population to feature %s', feature.properties.name);
        }
      }
    }
    populationFound++;
  }
}

console.log('Found population data for %d out of %d regions', populationFound, Object.keys(locations).length);

fs.writeFile(path.join('site', 'data', 'locations.json'), JSON.stringify(locations, null, 2), (err) => {
  if (err) {
    console.error('❌ Failed to write modified locations: %s', err);
    process.exit(1);
  }
  else {
    console.log('✅ Modified locations written successfully');

    fs.writeFile(path.join('site', 'data', 'features.json'), JSON.stringify(features, null, 2), (err) => {
      if (err) {
        console.error('❌ Failed to write modified features: %s', err);
        process.exit(1);
      }
      else {
        console.log('✅ Modified features written successfully');
      }
    });
  }
});
