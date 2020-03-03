import util from './gt.util.js';
import * as THREE from 'three';
import OrbitControls from 'three-orbitcontrols';
import Globe from './gt.Globe.js';
import Skybox from './gt.Skybox.js';
import Marker from './gt.Marker.js';
import Heatmap from './gt.Heatmap.js';

import data from '../../data/data.json';
import features from '../../data/features.json';
import drawThreeGeo from './lib/threeGeoJSON.js';
import * as randomPointGenerator from 'random-points-generator';

window.THREE = THREE;

const App = function(options) {
	util.extend(this, App.defaults, options);
	this.el = (this.el && this.el.nodeType) || (this.el && document.querySelector(this.el)) || document.body;

	// Permanantly bind animate so we don't have to call it in funny ways
	this.animate = this.animate.bind(this);
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

	if (this.menus === false) {
		this.typeSelectContainer.style.display = 'none';
	}

	// Shifty and unreliable way of detecting if we should update the heatmap as the slider moves
	// It's very slow on mobiles, so assume touchscreens are mobiles and just update on change
	let sliderChangeEvent = ('ontouchstart' in document.documentElement) ? 'change' : 'input';
	this.slider.addEventListener(sliderChangeEvent, () => {
		let dateIndex = this.slider.value;
		let dateString = Object.keys(data.days)[dateIndex];
		if (dateString) {
			this.setDate(dateString);
			this.pause();
		}
	});

	if (sliderChangeEvent !== 'input') {
		// Update the date while dragging on mobile
		this.slider.addEventListener('input', () => {
			let dateIndex = this.slider.value;
			let dateString = Object.keys(data.days)[dateIndex];
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

	let stopProp = (evt) => {
		// Prevent OrbitControls from breaking events
		evt.stopPropagation();
	};

	this.ui.addEventListener('mousedown', stopProp);
	this.ui.addEventListener('mousemove', stopProp);
	this.ui.addEventListener('mouseup', stopProp);
	this.ui.addEventListener('contextmenu', stopProp);
	this.ui.addEventListener('wheel', stopProp);
	this.ui.addEventListener('touchstart', stopProp);
	this.ui.addEventListener('touchmove', stopProp);
	this.ui.addEventListener('touchend', stopProp);
	this.ui.addEventListener('keydown', stopProp);

	// Listen to visualization type change
	this.typeSelect.addEventListener('input', (evt) => {
		var type = evt.target.value;
		this.setType(type);
	});

	// Get width of element
	this.width = this.container.scrollWidth;
	this.height = this.container.scrollHeight;

	// Create renderer
	this.renderer = new THREE.WebGLRenderer({
		antialias: true
	});
	this.renderer.setSize(this.width, this.height);
	this.canvas = this.renderer.domElement;
	this.canvas.className = 'gt_canvas';

	// Add canvas to container
	this.container.appendChild(this.canvas);

	// Create scene
	var scene = this.scene = window.scene = new THREE.Scene();

	// Setup camera
	var camera = this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.1, 100000);
	camera.position.set(0, 0 -550);
	scene.add(camera);

	// Setup lights
	this.ambientLight = new THREE.AmbientLight(0x222222, 5);
	scene.add(this.ambientLight);

	var cameraLight = new THREE.PointLight(0xFFFFFF, 1, 750);
	cameraLight.position.set(0, 0, this.cameraDistance);
	camera.add(cameraLight);

	// Add controls
	this.controls = new OrbitControls(this.camera, this.container);
	this.controls.minDistance = 250;
	this.controls.enablePan = false;

	// Update the hash when the camera is moved
	this.controls.addEventListener('end', (evt) => {
		this.setHashFromParameters();
	});

	// Show spinner
	this.showSpinner();

	// Add globe
	this.globe = new Globe({
		scene: scene,
		radius: this.earthRadius,
		cloudRadius: this.cloudRadius,
		cloudSpeed: this.cloudSpeed,
		loaded: this.handleLoaded.bind(this)
	});

	// Add skybox
	this.skybox = new Skybox({
		scene: scene
	});

	// Add heatmap
	this.heatmap = new Heatmap({
		scene: scene,
		radius: this.earthRadius + 1
	});

	var args = util.getHashArgs();
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

	// Add listeners
	window.addEventListener('popstate', this.setParametersFromHash.bind(this));
	window.addEventListener('resize', this.handleWindowResize.bind(this));
	window.addEventListener('blur', this.handleBlur.bind(this));
	window.addEventListener('focus', this.handleFocus.bind(this));


	// Generate randomly distributed points for each feature
	this.generateRandomPointSets(data);
	if (!args.type && !args.date) {
		this.showData(data);
	}

	// Set default parameters based on hash
	this.setParametersFromHash();

	if (args.playing) {
		this.play();
	}

	// Start animation
	this.animate(0);

	// Draw features
	if (this.drawFeatureLines) {
		this.featureContainer = new THREE.Object3D();
		this.scene.add(this.featureContainer);
		this.drawFeatures();
	}
};

App.defaults = {
	fps: false,
	menus: true,
	earthRadius: 200,
	markerRadius: 200,
	cloudRadius: 205,
	cloudSpeed: 0.000003,
	cameraDistance: 600,
	debug: false,
	pauseOnBlur: true,
	realtimeHeatmap: false,
	animateSun: false,

	drawFeatureLines: false,

	watchGPS: false,
	startAtGPS: true,
	dateHoldTime: 150,

	caseDivisor: 250,
	minimumCluster: 4,
	type: 'cases',

	itemName: 'item',
	itemNamePlural: 'items'
};

App.prototype.drawFeatures = function() {
	drawThreeGeo(features, this.earthRadius, 'sphere', {
		color: 'rgb(200, 200, 200)',
		opacity: 0.75,
		transparent: true,
	}, this.featureContainer);
};

// Animation
App.prototype.animate = function(time) {
	var timeDiff = time - this.lastTime;
	this.lastTime = time;

	// Update hooked functions
	this.controls.update();
	this.globe.update(timeDiff, time);

	if (this.playing && time >= this.lastDateChangeTime + this.dateHoldTime) {
		let dates = Object.keys(data.days);
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

	// Only update the heatmap if its real-time
	if (this.realtimeHeatmap)
		this.heatmap.update(timeDiff, time);

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
	this.showData(data, this.type, date);
	this.setHashFromParameters();
};

App.prototype.setType = function(type) {
	this.showData(data, type, this.date);
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
		this.showData(data, args.type, args.date);
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
	let vec3 = util.latLongToVector3(pos.coords.latitude, pos.coords.longitude, this.cameraDistance);
	this.camera.position.set(vec3.x, vec3.y, vec3.z);
	this.camera.lookAt(this.scene.position);
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

App.prototype.handleWindowResize = function() {
	// Remove ourselves from the equation to get a valid measurement
	this.canvas.style.display = 'none';

	this.width = this.container.scrollWidth;
	this.height = this.container.scrollHeight;
	this.camera.aspect = this.width / this.height;
	this.camera.updateProjectionMatrix();

	var ratio = window.devicePixelRatio || 1;

	this.renderer.setSize(this.width * ratio, this.height * ratio);
	this.camera.updateProjectionMatrix();

	this.canvas.style.display = 'block';
};

// Debug methods
App.prototype.addTestData = function() {
	this.add({
		label: 'SF',
		location: [37.7835916, -122.4091141]
	});

	for (var lat = -90; lat <= 90; lat += 15) {
		for (var lon = -180; lon < 180; lon += 15) {
			this.add({
				location: [lat, lon]
			});
		}
	}
};

App.prototype.positionSunForDate = function(date) {
	let dayOfYear = util.getDOY(util.getDateFromDatasetString(date));
	this.globe.setSunPosition(dayOfYear);
};

App.prototype.generateRandomPointSets = function(data) {
	var locations = data.locations;
	var latestDate = Object.keys(data.days).pop();
	var currentLocations = data.days[latestDate];

	console.log('⏳ Generating random point sets...');
	for (var locationId in currentLocations) {
		let locationData = currentLocations[locationId];
		var location = locations[locationId];
		var cases = locationData.cases;

		if (cases) {
			if (cases > this.caseDivisor * this.minimumCluster) {
				var locationString = (location.province ? location.province + ', ' : '') + location.country;

				let pointsToGenerate = Math.max(Math.round(cases / this.caseDivisor), 1);
				console.log('  %s: generating %d points for %d cases', locationString, pointsToGenerate, cases);
				try {
					location.pointFeatures = randomPointGenerator.random(pointsToGenerate, {
						features: features.features[location.featureId]
					});
				}
				catch(err) {
					console.error('    ⚠️ could not generate random points!');
				}
			}
		}
	}
};

App.prototype.showData = function(data, type, date) {
	let locations = data.locations;
	let firstDate = Object.keys(data.days).shift();
	let latestDate = Object.keys(data.days).pop();
	date = date || latestDate;
	type = type || this.type;

	if (!data.days[date]) {
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
	let dayNumber = Object.keys(data.days).indexOf(date);
	this.slider.max = Object.keys(data.days).length - 1;
	this.slider.value = dayNumber;

	// Set type
	this.typeSelect.value = this.type;

	// Position sun
	this.positionSunForDate(date);

	this.heatmap.clear();

	console.log('🗓 %s', date);

	let currentLocations = data.days[date];
	let count = 0;
	for (let locationId in currentLocations) {
		let locationData = currentLocations[locationId];
		let location = locations[locationId];
		let cases = locationData[type];
		if (cases) {
			let locationString = (location.province ? location.province + ', ' : '') + location.country;

			if (location.pointFeatures) {
				let clusterCount = Math.round(cases / this.caseDivisor);
				let size = 25;
				let intensity = 0.5;
				console.log('  %s: %d %s (%d points of %dpx and %f intensity)', locationString, cases, type, clusterCount, size, intensity);

				for (let i = 0; i < clusterCount; i++) {
					let pointFeature = location.pointFeatures.features[i];
					let coordinates = pointFeature.geometry.coordinates;
					this.add({
						location: coordinates,
						size: size,
						intensity: intensity
					});
				}
			}
			else {
				let size = Math.max(((Math.log(cases) / Math.log(2))) * 5, 9);
				let intensity = 0.75;
				console.log('  %s: %d %s (1 point of %dpx and %f intensity)', locationString, cases, type, size, intensity);

				this.add({
					location: location.coordinates,
					size: size,
					intensity: intensity
				});
			}

			count += cases;
		}
	}

	// this.countEl.innerText = count.toLocaleString()+' '+(count === 1 ? this.itemName : this.itemNamePlural || this.itemName || 'items');
	this.countEl.innerText = count.toLocaleString();
};

export default App;
