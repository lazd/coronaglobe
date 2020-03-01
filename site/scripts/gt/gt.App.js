import util from './gt.util.js';
import * as THREE from 'three';
import OrbitControls from 'three-orbitcontrols';
import Globe from './gt.Globe.js';
import Skybox from './gt.Skybox.js';
import Marker from './gt.Marker.js';
import Heatmap from './gt.Heatmap.js';

import data from '../../data/data.json';

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

	// Track loaded status
	this.loaded = false;

	// Track running status
	this.running = true;

	// Create a container
	// Create an element for output
	this.container = this.el.querySelector('.gt_container');
	this.ui = this.el.querySelector('.gt_ui');
	this.countEl = this.container.querySelector('.gt_count');
	this.overlay = this.container.querySelector('.gt_overlay');
	this.indicator = this.container.querySelector('.gt_indicator');
	this.output = this.container.querySelector('.gt_output');
	this.typeSelectContainer = this.container.querySelector('.gt_forSelect');
	this.typeSelect = this.container.querySelector('.gt_heatmapType');
	this.pauseButton = this.container.querySelector('.gt_pauseButton');
	this.locationButton = this.container.querySelector('.gt_locationButton');
	this.indicator = this.container.querySelector('.gt_indicator');
	this.slider = this.container.querySelector('.gt_dateSlider');
	this.date = this.container.querySelector('.gt_date');

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
			this.showData(data, dateString);
		}
	});

	if (sliderChangeEvent !== 'input') {
		// Update the date while dragging on mobile
		this.slider.addEventListener('input', () => {
			let dateIndex = this.slider.value;
			let dateString = Object.keys(data.days)[dateIndex];
			this.date.innerText = dateString;
		});
	}

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
	this.typeSelect.addEventListener('change', (evt) => {
		var type = evt.target.value;
		// this.setType(type);
	});

	// Get width of element
	this.width = this.container.scrollWidth;
	this.height = this.container.scrollHeight;

	// Create renderer
	this.renderer = new THREE.WebGLRenderer();
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

	if (window.location.protocol === 'https:') {
		// Watch GPS position
		if (this.watchGPS)
			this.startWatchingGPS();

		var args = util.getHashArgs();
		if (this.startAtGPS && !args.lat && !args.long)
			this.moveToGPS();
	}
	else {
		this.rotateTo({
			coords: {
				latitude: 30.5928,
				longitude: 114.3055
			}
		});
	}

	// Set default parameters based on hash
	this.setParametersFromHash();

	// Add listeners
	window.addEventListener('popstate', this.setParametersFromHash.bind(this));
	window.addEventListener('resize', this.handleWindowResize.bind(this));
	window.addEventListener('blur', this.handleBlur.bind(this));
	window.addEventListener('focus', this.handleFocus.bind(this));
	this.pauseButton.addEventListener('click', this.togglePause.bind(this))
	this.locationButton.addEventListener('click', this.moveToGPS.bind(this))

	// Show data for the current date
	this.showData(data);

	// Start animation
	this.animate(0);
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

	watchGPS: false,
	startAtGPS: true,

	itemName: 'item',
	itemNamePlural: 'items'
};

// Animation
App.prototype.animate = function(time) {
	var timeDiff = time - this.lastTime;
	this.lastTime = time;

	// Update hooked functions
	this.controls.update();
	this.globe.update(timeDiff, time);

	// Only update the heatmap if we're running
	if (this.running && this.realtimeHeatmap)
		this.heatmap.update(timeDiff, time);

	// Re-align the sun every minute
	if (time - this.lastSunAlignment > 1000*60) {
		this.globe.setSunPosition();
		this.lastSunAlignment = time;
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
	this.locationButton.classList.remove('gt_selected');
	navigator.geolocation.clearWatch(this._geoWatchID);
	this.watchGPS = false;
};

App.prototype.setParametersFromHash = function(styleName) {
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
	this.overlay.classList.remove('hide');
	if (type)
		this.indicator.className = 'gt_'+type;
};

App.prototype.hideOverlay = function(type) {
	this.overlay.classList.add('hide');
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
	if (this.running)
		this.pause();
	else
		this.play();
}

App.prototype.pause = function() {
	if (this.loaded) {
		this.showOverlay('paused');
		this.pauseButton.classList.remove('gt_icon-pause');
		this.pauseButton.classList.add('gt_icon-play');
		this.running = false;
		this.indicator.addEventListener('click', this.play);
	}
};

App.prototype.play = function() {
	if (this.loaded) {
		this.hideOverlay('paused');
		this.pauseButton.classList.remove('gt_icon-play');
		this.pauseButton.classList.add('gt_icon-pause');
		this.indicator.removeEventListener('click', this.play);
		this.running = true;
	}
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
		this.locationButton.classList.add('gt_selected');
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

App.prototype.showData = function(data, date) {
	var locations = data.locations;
	var latestDate = Object.keys(data.days).pop();
	if (!date) {
		date = latestDate;
	}
	var currentLocations = data.days[date];
	this.date.innerText = date;

	let dayNumber = Object.keys(data.days).indexOf(date);
	this.slider.max = Object.keys(data.days).length - 1;
	this.slider.value = dayNumber;

	this.heatmap.clear();

	console.log('🗓 %s', date);

	let count = 0;
	for (var locationData of currentLocations) {
		var location = locations[locationData.id];
		var cases = locationData.cases;
		if (cases) {
			var size = ((Math.log(locationData.cases) / Math.log(1.5)) + 1) * 4.5;
			var intensity = 0.7;
			var locationString = (location['Province/State'] ? location['Province/State'] + ', ' : '') + location['Country/Region']
			console.log('  ', locationString + ':', locationData.cases + ' cases');
			// console.log('  ', locationString + ':', locationData.cases + ' cases', 'at', location.Lat + ',' + location.Long, 'with size ' + size);
			this.add({
				total: cases,
				location: [location.Lat, location.Long],
				size: size,
				intensity: intensity
			});

			count += cases;
		}
	}

	this.countEl.innerText = count.toLocaleString()+' '+(count === 1 ? this.itemName : this.itemNamePlural || this.itemName || 'items');
};

App.prototype.fetchData = function() {
	var app = this;
	var req = new XMLHttpRequest();
	req.addEventListener('load', function() {
		var data = JSON.parse(req.responseText);
		app.showData(data);
	});
	req.open('GET', 'data/data.json');
	req.send();
};

export default App;
