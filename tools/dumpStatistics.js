function dumpStatistics({regionDays, featureCollection, locationDays, locations}) {
  let rateOrder = [];
  let lastDate = Object.keys(regionDays).pop();
  for (let featureId in regionDays[lastDate]) {
    let info = regionDays[lastDate][featureId];
    if (info.rate && info.active > 1) {
      let feature = featureCollection.features[featureId];
      rateOrder.push(Object.assign({
        name: feature.properties.name,
        population: feature.properties.pop_est
      }, info));
    }
  }

  rateOrder = rateOrder.sort((a, b) => {
    if (a.rate == b.rate) {
      return 0;
    }
    if (a.rate > b.rate) {
      return -1;
    }
    else {
      return 1;
    }
  });

  console.log('🗒  Highest rates for %s', lastDate);
  for (var i = 0; i < 25 && i < rateOrder.length; i++) {
    let rateInfo = rateOrder[i];
    console.log('  %d. %s: %s% (%s out of %s)', i + 1, rateInfo.name, rateInfo.rate.toFixed(8), rateInfo.active.toLocaleString('en-US'), rateInfo.population.toLocaleString('en-US'));
  }
}

module.exports = dumpStatistics;
