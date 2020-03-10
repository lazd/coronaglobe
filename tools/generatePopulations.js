const fsp = require('fs').promises;
const path = require('path');
const parse = require('csv-parse/lib/sync');

const dataPath = path.join('data');

async function readCSV(csvPath) {
  let data = await fsp.readFile(path.resolve(dataPath, csvPath), 'utf8')
  let source = parse(data, {
    columns: true
  });

  let populationData = {};
  for (let item of source) {
    if (item.population) {
      populationData[item.name] = parseInt(item.population, 10);
    }
    else {
      reject(`Invalid data in ${csvPath} for ${item.name}`);
      return;
    }
  }

  return populationData;
}

// Todo: share between modules
function getLocationName(location) {
  return (location.province ? location.province + ', ' : '') + location.country;
}

async function readPopulationData(featureCollection) {
  let populations = {
    US: {
      state: await readCSV('population-us-states.csv'),
      county: await readCSV('population-us-counties.csv')
    },
    byProvince: {
      'Mainland China': await readCSV('population-chinese-admin-divisions.csv'),
      'Australia': await readCSV('population-australia-states.csv'),
      'Canada': await readCSV('population-canada-provinces.csv'),
      'Italy': await readCSV('population-italy-regions.csv')
    },
    byCountry: {},
    supplemental: await readCSV('population-supplemental.csv')
  };

  // Done  
  populations.byProvince.CN = populations.byProvince['Mainland China'];
  populations.byProvince.CA = populations.byProvince['Canada'];
  populations.byProvince.AUS = populations.byProvince['Australia'];

  // Store data from features
  for (let feature of featureCollection.features) {
    if (feature.properties.pop_est) {
      populations.byCountry[feature.properties.name] = feature.properties.pop_est;
      if (feature.properties.name_en) {
        populations.byCountry[feature.properties.name_en] = feature.properties.pop_est;
      }
      if (feature.properties.abbrev) {
        populations.byCountry[feature.properties.abbrev.replace(/\./g, '')] = feature.properties.pop_est;
      }
    }
  }

  return populations;
}

async function generatePopulations({locationDays, locations, featureCollection}) {
  console.log('⏳ Getting population data...');

  let populations = await readPopulationData(featureCollection);

  function getPopulation(country, province) {
    let population = null;

    // Try population data by region
    if (country && province) {
      if (country === 'US') {
        let countyName = province;
        if (!countyName.match('County')) {
          let parts = countyName.split(', ');
          countyName = parts[0] + ' County, ' + parts[1];
        }

        if (populations.US.county[province] || populations.US.county[countyName]) {
          // Try counties
          population = populations.US.county[province];
        }
        else if (populations.US.state[province]) {
          // Try states
          population = populations.US.state[province];
        }
      }
      else {
        let populationData = populations.byProvince[country];
        if (populationData) {
          population = populationData[province];
        }
      }
    }

    // Try population by country
    if (!population) {
      if (!province || province === country) {
        population = populations.byCountry[country];
      }
    }

    if (!population) {
      population = populations.supplemental[province];
    }

    if (!population) {
      population = populations.supplemental[country];
    }

    return population;
  }

  let populationFound = 0;
  for (let location of locations) {
    let population = getPopulation(location.country, location.province);

    if (!population) {
      console.error('  ❌ %s: ?', getLocationName(location));
    }
    else {
      location.population = population;
      // console.log('  ✅ %s: %s', getLocationName(location), population);

      if (location.featureId) {
        let feature = featureCollection.features[location.featureId];
        if (feature) {
          if (!feature.properties.pop_est) {
            feature.properties.pop_est = population;
            // console.log('  ✅ %s: %d', feature.properties.name, population);
          }
        }
      }
      populationFound++;
    }
  }
  console.log('✅ Found population data for %d out of %d locations', populationFound, Object.keys(locations).length);

  let featurePopulationFound = 0;
  for (let feature of featureCollection.features) {
    if (feature.properties.pop_est) {
      featurePopulationFound++
    }
    else {
      let population = getPopulation(feature.properties.iso_a2 || 'US', feature.properties.name) || getPopulation(feature.properties.iso_a2 || 'US', feature.properties.shortName);

      if (population) {
        // console.log('  ✅ %s: %d', feature.properties.name, population);
        feature.properties.pop_est = population;
        featurePopulationFound++
      }
    }
    if (!feature.properties.pop_est) {
      console.error('  ❌ %s: ?', feature.properties.name);
    }
  }

  console.log('✅ Found population data for %d out of %d features', featurePopulationFound, featureCollection.features.length);

  return {locationDays, locations, featureCollection};
}

module.exports = generatePopulations;
