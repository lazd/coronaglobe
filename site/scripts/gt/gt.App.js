import util from './gt.util.js';
import * as THREE from 'three';
import Heatmap from './gt.Heatmap.js';

import * as itowns from 'itowns';
import { MAIN_LOOP_EVENTS } from 'itowns/lib/Core/MainLoop';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import countries from '../../../data/ne_10m_admin_0_countries-4pct.json';
import provinces from '../../../data/ne_10m_admin_1_states_provinces-10pct.json';

import config from '../../../data/config.json';
import cases from '../../data/cases.json';
// import features from '../../data/features.json';
import * as features from '../../../data/ne_10m_admin_1_states_provinces-10pct.json';
// import features from '../../data/beijing.json';
import locations from '../../data/locations.json';
import points from '../../data/points.json';

window.THREE = THREE;

const App = function(options) {
	util.extend(this, App.defaults, options);
	this.el = (this.el && this.el.nodeType) || (this.el && document.querySelector(this.el)) || document.body;

	this.play = this.play.bind(this);

	// Hold markers
	this.markers = [];

	// Track time change for render loop
	this.lastTime = 0;
	this.lastSunAlignment = 0;
	this.lastDateChangeTime = 0;

	// Track loaded status
	this.loaded = false;

	// Track play status
	this.playing = false;

	// Create a container
	// Create an element for output
	this.container = this.el.querySelector('.gt_container');
	this.ui = this.el.querySelector('.gt_ui');
	this.countEl = this.container.querySelector('.gt_count');
	this.overlay = this.container.querySelector('.gt_overlay');
	this.indicator = this.container.querySelector('.gt_indicator');
	this.output = this.container.querySelector('.gt_output');
	this.typeSelectContainer = this.container.querySelector('.gt_forSelect');
	this.typeSelect = this.container.querySelector('.gt_typeSelect');
	this.pauseButton = this.container.querySelector('.gt_pauseButton');
	this.locationButton = this.container.querySelector('.gt_locationButton');
	this.slider = this.container.querySelector('.gt_dateSlider');
	this.about = this.container.querySelector('.gt_about');
	this.infoButton = this.container.querySelector('.gt_infoButton');
	this.datePicker = this.container.querySelector('.gt_datePicker');

	// Shifty and unreliable way of detecting if we should update the heatmap as the slider moves
	// It's very slow on mobiles, so assume touchscreens are mobiles and just update on change
	let sliderChangeEvent = ('ontouchstart' in document.documentElement) ? 'change' : 'input';
	this.slider.addEventListener(sliderChangeEvent, () => {
		let dateIndex = this.slider.value;
		let dateString = Object.keys(cases)[dateIndex];
		if (dateString) {
			this.setDate(dateString);
			this.pause();
		}
	});

	if (sliderChangeEvent !== 'input') {
		// Update the date while dragging on mobile
		this.slider.addEventListener('input', () => {
			let dateIndex = this.slider.value;
			let dateString = Object.keys(cases)[dateIndex];
			this.datePicker.value = util.formatDateForInput(dateString);
		});
	}

	this.datePicker.addEventListener('input', () => {
		if (this.datePicker.value) {
			let dateString = util.formatDateForDataset(this.datePicker.value);
			this.pause();
			this.setDate(dateString);
		}
	});

	// Show info overlay
	this.infoButton.addEventListener('click', (evt) => {
		this.about.classList.add('is-open');
	});

	// Hide info overlay
	this.about.addEventListener('click', (evt) => {
		if (evt.target.classList.contains('gt_overlay')) {
			this.about.classList.remove('is-open');
		}
	});

	this.pauseButton.addEventListener('click', this.togglePause.bind(this));
	this.locationButton.addEventListener('click', this.moveToGPS.bind(this));

	// Listen to visualization type change
	this.typeSelect.addEventListener('input', (evt) => {
		var type = evt.target.value;
		this.setType(type);
	});

	// Update the hash when the camera is moved
	// this.controls.addEventListener('end', (evt) => {
	// 	this.setHashFromParameters();
	// });

	// Show spinner
	// this.showSpinner();

	// Get args
	var args = util.getHashArgs();

	// Add heatmap
	// this.heatmap = new Heatmap({
	// 	scene: scene,
	// 	radius: this.earthRadius + 1,
	// 	ready: () => {
	// 		this.showData();
	// 	}
	// });

	if (!args.lat && !args.long) {
		if ((this.startAtGPS || this.watchGPS) && window.location.protocol === 'https:') {
			// Watch GPS position
			if (this.watchGPS)
				this.startWatchingGPS();

			if (this.startAtGPS)
				this.moveToGPS();
		}
		else {
			// Start at Wuhan
			this.rotateTo({
				coords: {
					latitude: 30.5928,
					longitude: 114.3055
				}
			});
		}
	}

	// Show data if no arguments passed
	if (!args.type && !args.date) {
		this.showData();
	}

	// Set default parameters based on hash, show data if arguments passed
	this.setParametersFromHash();

	// Add listeners
	window.addEventListener('popstate', this.setParametersFromHash.bind(this));
	window.addEventListener('blur', this.handleBlur.bind(this));
	window.addEventListener('focus', this.handleFocus.bind(this));

	// Start animation
	// this.animate(0);

	this.view = new itowns.GlobeView(
		this.container,
		{
			// coord: new itowns.Coordinates('EPSG:4326', 3.05, 48.95), // weird river thing
			coord: new itowns.Coordinates('EPSG:4326', 116.389, 39.9488), // bejing
			// coord: new itowns.Coordinates('EPSG:4326', 118.178, 26.408), // Fujian
			range: 25000000
			// range: 70000
		},
		{
			renderer: {
				// antialias: false,
				// alpha: false,
				// logarithmicDepthBuffer: false
			}
			// noControls: true
		}
	 );

	let layerPath = 'http://www.itowns-project.org/itowns/examples/layers/';
	itowns.Fetcher.json(`${layerPath}/JSONLayers/Ortho.json`)
		.then((config) => {
			config.source = new itowns.WMTSSource(config.source);
			var layer = new itowns.ColorLayer('Ortho', config);
			this.view.addLayer(layer).then(() => {
        itowns.ColorLayersOrdering.moveLayerToIndex(this.view, 'Ortho', 0);
      });
		});

	// Add two elevation layers.
	// These will deform iTowns globe geometry to represent terrain elevation.
	/*
	let addElevationLayerFromConfig = (config) => {
		config.source = new itowns.WMTSSource(config.source);
		let layer = new itowns.ElevationLayer(config.id, config);
		this.view.addLayer(layer);
	};
	itowns.Fetcher.json(`${layerPath}/JSONLayers/WORLD_DTM.json`).then(addElevationLayerFromConfig);
	itowns.Fetcher.json(`${layerPath}/JSONLayers/IGN_MNT_HIGHRES.json`).then(addElevationLayerFromConfig);
	*/

  var optionsGeoJsonParser = {
    buildExtent: true,
    crsIn: 'EPSG:4326',
    crsOut: this.view.tileLayer.extent.crs,
    mergeFeatures: true,
    withNormal: false,
    withAltitude: false,
  };

  // Convert by iTowns
  itowns.GeoJsonParser.parse(features, optionsGeoJsonParser)
    .then((parsedData) => {
    	console.log(parsedData);
      var ariegeSource = new itowns.FileSource({
        parsedData,
				zoom: { min: 0, max: 10000 }
      });

      var ariegeLayer = new itowns.ColorLayer('ariege', {
          name: 'ariege',
          transparent: true,
          style: {
              fill: {
                color: 'orange',
                opacity: 0.5,
              },
              stroke: {
                  color:'white',
              },
          },
          source: ariegeSource,
      });

      return this.view.addLayer(ariegeLayer);
  })
  // .then(FeatureToolTip.addLayer);

	/*
	itowns.GeoJsonParser.parse(features, {
			buildExtent: true,
			crsIn: 'EPSG:4326',
			crsOut: this.view.tileLayer.extent.crs,
			mergeFeatures: true,
			withNormal: true,
			withAltitude: true,
			overrideAltitudeInToZero: true
		})
		.then((parsedData) => {
			let source = new itowns.FileSource({
				parsedData,
				projection: 'EPSG:4326',
				zoom: { min: 10, max: 500 }
			});

			var regions = new itowns.GeometryLayer('Regions', new THREE.Group());
			regions.update = itowns.FeatureProcessing.update;
			regions.convert = itowns.Feature2Mesh.convert({
				color: new THREE.Color(0xFF0000),
				extrude: 90
			});
			regions.transparent = true;
			regions.opacity = 0.9;
			regions.source = source;

			this.view.addLayer(regions);
		});	
	*/
	// regions.source = new itowns.FileSource({
	// 	parsedData: itowns.GeoJsonParser.parse(JSON.stringify(features), {}),
	// 	zoom: { min: 10, max: 10 }
	// });
	// regions.source = new itowns.FileSource({
	// 	url: 'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/multipolygon.geojson',
	// 	projection: 'EPSG:4326',
	// 	format: 'application/json',
	// 	zoom: { min: 10, max: 10 },
	//  });


	// this.view.controls = new OrbitControls(this.view.camera.camera3D, this.container);

	this.view.addFrameRequester(MAIN_LOOP_EVENTS.BEFORE_RENDER, (time) => {
		console.log('Update called');
	});

	// this.view.controls.minAzimuthAngle = - Math.PI / 2;
	// this.view.controls.maxAzimuthAngle = Math.PI / 2;
	// this.view.controls.minPolarAngle = - Math.PI / 2;
	// this.view.controls.maxPolarAngle = Math.PI / 2;
	// this.view.controls.rotateSpeed = true;

	// Todo: apply class to itown's view
	// this.canvas.className = 'gt_canvas';

	// Debug
	window.scene = this.view.scene;
};

App.defaults = {
	earthRadius: 200,
	markerRadius: 200,
	cloudRadius: 205,
	cloudSpeed: 0.000003,
	cameraDistance: 600,
	pauseOnBlur: true,
	animateSun: false,

	drawFeatureLines: true,

	watchGPS: false,
	startAtGPS: true,
	dateHoldTime: 150,

	type: 'cases',

	itemName: 'item',
	itemNamePlural: 'items'
};

// Animation
App.prototype.animate = function(time) {
	var timeDiff = time - this.lastTime;
	this.lastTime = time;

	// Update hooked functions
	if (this.playing && time >= this.lastDateChangeTime + this.dateHoldTime) {
		let dates = Object.keys(cases);
		let dateIndex = dates.indexOf(this.date);
		let lastDate = dates.length - 1;
		if (dateIndex < lastDate) {
			dateIndex++;
		}
		else {
			dateIndex = 0;
		}

		this.setDate(dates[dateIndex]);
		this.lastDateChangeTime = time;
	}

	if (this.playing && time >= this.lastSunAlignment + this.dateHoldTime / 24) {
		if (this.animateSun) {
			let dayOfYear = util.getDOY(util.getDateFromDatasetString(this.date));
			let elapsed = (time - this.lastSunAlignment);
			let fractionOfDayPast = elapsed / this.dateHoldTime;
			let hour = Math.round(fractionOfDayPast * 24);

			this.globe.setSunPosition(dayOfYear, hour);

			if (this.playing && time >= this.lastSunAlignment + this.dateHoldTime) {
				this.lastSunAlignment = time;
			}
		}
	}
	else {
		// Re-align the sun every minute
		if (time - this.lastSunAlignment > 1000*60) {
			this.positionSunForDate(this.date);
			this.lastSunAlignment = time;
		}
	}

	this.render();
	requestAnimationFrame(this.animate);
};

App.prototype.render = function() {
	this.renderer.render(this.scene, this.camera);
};

App.prototype.moveToGPS = function() {
	// Ask for and go to user's position
	navigator.geolocation.getCurrentPosition((function(pos) {
		this.rotateTo(pos);
	}).bind(this));
};

App.prototype.startWatchingGPS = function() {
	// Ask for and watch user's position
	this._geoWatchID = navigator.geolocation.watchPosition(this.handleGeolocationChange.bind(this));
	this.watchGPS = true;
};

App.prototype.stopWatchingGPS = function() {
	this.locationButton.classList.remove('is-selected');
	navigator.geolocation.clearWatch(this._geoWatchID);
	this.watchGPS = false;
};

App.prototype.setDate = function(date) {
	// Store the date in the hash if it was set explicitly
	this.dateSet = true;
	this.showData(this.type, date);
	this.setHashFromParameters();
};

App.prototype.setType = function(type) {
	this.showData(type, this.date);
	this.setHashFromParameters();
};

App.prototype.setParametersFromHash = function() {
	let args = util.getHashArgs();

	var lat = parseFloat(args.lat);
	var long = parseFloat(args.long);
	if (lat && long) {
		this.rotateTo({
			coords: {
				latitude: lat,
				longitude: long
			}
		});
	}

	if (args.type || args.date) {
		if (args.date) {
			// Store the date in the hash if it came from the hash
			this.dateSet = true;
		}
		this.showData(args.type, args.date);
	}

	if (args.playing === 'true') {
		this.playing = true;
		this.play();
	}
};

App.prototype.setHashFromParameters = function() {
	var lat = 0;
	var long = 0;
	var amithuzalAngle = this.controls.getAzimuthalAngle();
	var polarAngle = this.controls.getPolarAngle();
	lat = (util.rad2deg(polarAngle - Math.PI / 2) * -1);
	long = util.rad2deg(amithuzalAngle - Math.PI / 2);

	if (long <= -180) {
		long = 360 + long;
	}

	// Round
	long = util.round(long, 1000);
	lat = util.round(lat, 1000);

	util.setHashFromArgs({
		playing: this.playing,
		date: this.dateSet ? this.date : null,
		type: this.type,
		lat: lat,
		long: long
	});
};

// Marker management
App.prototype.add = function(data) {
	this.heatmap.add(data);
	// this.addMarker(data); // Markers are very, very slow
};

App.prototype.addMarker = function(data) {
	// Create a new marker instance
	var marker = new Marker({
		data: data,
		location: data.location,
		radius: this.markerRadius,
		scene: this.scene
	});

	// Store instance
	this.markers.push(marker);
};

App.prototype.rotateTo = function(pos) {
	// TODO: Animate rotation smoothly
	// let vec3 = util.latLongToVector3(pos.coords.latitude, pos.coords.longitude, this.cameraDistance);
	// this.camera.position.set(vec3.x, vec3.y, vec3.z);
	// this.camera.lookAt(this.scene.position);
};

App.prototype.showOverlay = function(type) {
	this.overlay.classList.add('is-open');
	if (type)
		this.indicator.className = 'gt_'+type;
};

App.prototype.hideOverlay = function(type) {
	this.overlay.classList.remove('is-open');
	if (type)
		this.indicator.className = 'gt_'+type;
};

// Handlers
App.prototype.showSpinner = function() {
	this.showOverlay('loading gt_icon-spinner');
};

App.prototype.hideSpinner = function() {
	this.hideOverlay('loading gt_icon-spinner');
};

App.prototype.handleLoaded = function() {
	this.hideSpinner();
	this.loaded = true;
};

App.prototype.togglePause = function() {
	if (this.playing)
		this.pause();
	else
		this.play();
}

App.prototype.pause = function() {
	this.pauseButton.classList.remove('gt_icon--pause');
	this.pauseButton.classList.add('gt_icon--play');
	this.playing = false;
	this.setHashFromParameters();
};

App.prototype.play = function() {
	this.pauseButton.classList.remove('gt_icon--play');
	this.pauseButton.classList.add('gt_icon--pause');
	this.playing = true;
	this.setHashFromParameters();
};

App.prototype.handleBlur = function() {
	if (this.pauseOnBlur) {
		this.pause();
	}
};

App.prototype.handleFocus = function() {
	if (this.pauseOnBlur) {
		this.play();
	}
};

App.prototype.toggleGPS = function() {
	if (this.watchGPS) {
		this.stopWatchingGPS();
	}
	else {
		this.startWatchingGPS();
	}
};

App.prototype.handleGeolocationChange = function(pos) {
	if (this.watchGPS) {
		this.rotateTo(pos);
		this.locationButton.classList.add('is-selected');
	}
};

App.prototype.positionSunForDate = function(date) {
	let dayOfYear = util.getDOY(util.getDateFromDatasetString(date));
	this.globe.setSunPosition(dayOfYear);
};

App.prototype.showData = function(type, date) {
	return;

	let firstDate = Object.keys(cases).shift();
	let latestDate = Object.keys(cases).pop();
	date = date || latestDate;
	type = type || this.type;

	if (!cases[date]) {
		console.error('No data for %s', date);
		return;
	}

	// Store current date/type
	this.type = type;
	this.date = date;

	// Configure datepicker
	this.datePicker.min = util.formatDateForInput(firstDate);
	this.datePicker.max = util.formatDateForInput(latestDate);
	this.datePicker.value = util.formatDateForInput(date);

	// Position slider
	let dayNumber = Object.keys(cases).indexOf(date);
	this.slider.max = Object.keys(cases).length - 1;
	this.slider.value = dayNumber;

	// Set type
	this.typeSelect.value = this.type;

	// Position sun
	this.positionSunForDate(date);

	this.heatmap.clear();

	console.log('🗓 %s', date);

	let currentLocations = cases[date];
	let count = 0;
	for (let locationId in currentLocations) {
		let locationData = currentLocations[locationId];
		let location = locations[locationId];
		let cases = locationData[type];
		if (cases) {
			let locationString = (location.province ? location.province + ', ' : '') + location.country;

			if (points[locationId]) {
				// Location has enough cases to have randomly distributed clusters
				let clusterCount = Math.round(cases / config.caseDivisor);
				let size = 2.5;
				let intensity = 1;
				let infectionPercent = 0;
				if (location.population) {
					infectionPercent = cases / location.population;
				}

				console.log('  %s: %d %s out of %d population (%f %) (%d points of %dpx and %f intensity)', locationString, cases, type, location.population, infectionPercent, clusterCount, size, intensity);

				for (let i = 0; i < clusterCount; i++) {
					let coordinates = points[locationId][i];
					this.add({
						coordinates: coordinates,
						size: size,
						intensity: intensity
					});
				}
			}
			else {
				// Location doesn't have enough cases for distribution, create a blob at center
				let size = 5;
				let intensity = 0.75;
				console.log('  %s: %d %s (1 point of %dpx and %f intensity)', locationString, cases, type, size, intensity);

				this.add({
					coordinates: location.coordinates,
					size: size,
					intensity: intensity
				});
			}

			count += cases;
		}
	}

	// this.countEl.innerText = count.toLocaleString()+' '+(count === 1 ? this.itemName : this.itemNamePlural || this.itemName || 'items');
	this.countEl.innerText = count.toLocaleString();

	this.heatmap.update();
};

export default App;
