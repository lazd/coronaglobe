import util from './gt.util.js';
import * as THREE from 'three/build/three.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import Globe from './gt.Globe.js';
import Skybox from './gt.Skybox.js';
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

	// Track # of tweets
	this.count = 0;

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
	this.countEl = this.container.querySelector('.gt_count');
	this.overlay = this.container.querySelector('.gt_overlay');
	this.indicator = this.container.querySelector('.gt_indicator');
	this.output = this.container.querySelector('.gt_output');
	this.typeSelectContainer = this.container.querySelector('.gt_forSelect');
	this.typeSelect = this.container.querySelector('.gt_heatmapType');
	this.pauseButton = this.container.querySelector('.gt_pauseButton');
	this.locationButton = this.container.querySelector('.gt_locationButton');
	this.indicator = this.container.querySelector('.gt_indicator');

	if (this.menus === false) {
		this.typeSelectContainer.style.display = 'none';
	}

	// Listen to visualization type change
	this.typeSelect.addEventListener('change', function(evt) {
		var style = evt.target.value;
		this.setStyle(style);
	}.bind(this));

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
	this.directionalLight =  new THREE.DirectionalLight(0xFFFFFF, 0.75);
	scene.add(this.directionalLight);

	this.ambientLight = new THREE.AmbientLight(0x222222, 5);
	scene.add(this.ambientLight);

	var cameraLight = new THREE.PointLight(0xFFFFFF, 1, 1000);
	cameraLight.position.set(0, 0, this.cameraDistance);
	camera.add(cameraLight);

	this.setSunPosition();

	// Add controls
	this.controls = new OrbitControls(this.camera, this.container);

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

	// Watch GPS position
	if (this.watchGPS)
		this.startWatchingGPS();

	if (this.startAtGPS)
		this.moveToGPS();

	// Set default parameters based on hash
	this.setParametersFromHash();

	// Add listeners
	window.addEventListener('hashchange', this.setParametersFromHash.bind(this));
	window.addEventListener('resize', this.handleWindowResize.bind(this));
	window.addEventListener('blur', this.handleBlur.bind(this));
	window.addEventListener('focus', this.handleFocus.bind(this));
	this.pauseButton.addEventListener('click', this.togglePause.bind(this))
	this.locationButton.addEventListener('click', this.moveToGPS.bind(this))

	// Add debug information
	if (this.debug || this.fps)
		this.addStats();

	this.loadData(data);

	// Start animation
	this.animate(0);
};

App.defaults = {
	fps: false,
	menus: true,
	count: true,
	earthRadius: 200,
	markerRadius: 200,
	cloudRadius: 205,
	cloudSpeed: 0.000003,
	cameraDistance: 600,
	debug: false,
	pauseOnBlur: true,

	watchGPS: false,
	startAtGPS: true,

	itemName: 'item',
	itemNamePlural: 'items',

	heatmapStyle: 'default',

	heatmapStyles: {
		default: {}
	}};

// Animation
App.prototype.animate = function(time) {
	var timeDiff = time - this.lastTime;
	this.lastTime = time;

	// Update hooked functions
	this.controls.update();
	this.globe.update(timeDiff, time);

	// Only update the heatmap if we're running
	if (this.running)
		this.heatmap.update(timeDiff, time);

	// Re-align the sun every minute
	if (time - this.lastSunAlignment > 1000*60) {
		this.setSunPosition();
		this.lastSunAlignment = time;
	}

	// Slowly set time for today's date
	// this.setSunPosition(util.getDOY(), time / 1000 % 24);

	// Test year + day
	// this.setSunPosition(time / 100 % 365, time / 24 % 24);

	this.render();
	requestAnimationFrame(this.animate);

	if (this.stats)
		this.stats.update();
};

App.prototype.render = function() {
	this.renderer.render(this.scene, this.camera);
};

App.prototype.setSunPosition = function(dayOfYear, utcHour) {
	if (typeof dayOfYear === 'undefined' || typeof dayOfYear === 'undefined') {
		var d = new Date();
		dayOfYear = util.getDOY(d);
		utcHour = d.getUTCHours();
	}

	var sunFraction = utcHour / 24;

	// Calculate the longitude based on the fact that the 12th hour UTC should be sun at 0° latitude
	var sunLong = sunFraction * -360 + 180;

	// Calculate declination angle
	// Via http://pveducation.org/pvcdrom/properties-of-sunlight/declination-angle
	var sunAngle = 23.45*Math.sin(util.deg2rad(360/365 * (dayOfYear-81)));

	// Calcuate the 3D position of the sun
	var sunPos = util.latLongToVector3(sunAngle, sunLong, 1500);
	this.directionalLight.position.copy(sunPos);
	// console.log('%s on %d day of year: Sun at longitude %s, angle %s', utcHour.toFixed(3), dayOfYear, sunLong.toFixed(3), sunAngle.toFixed(3));
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
	var style = util.getHashArgs().style;
	if (!style)
		style = this.heatmapStyle;
	this.setStyle(style);

	var lat = util.getHashArgs().lat;
	var long = util.getHashArgs().long;
	if (lat && long) {
		this.rotateTo({
			coords: {
				latitude: lat,
				longitude: long
			}
		});
	}
};

App.prototype.setStyle = function(styleName) {
	this.typeSelect.value = styleName;
	this.heatmap.set(this.heatmapStyles[styleName]);
	util.setHashFromArgs({
		style: styleName
	});
};

// Marker management
App.prototype.add = function(data) {
	this.count += data.total;

	this.countEl.innerText = this.count.toLocaleString()+' '+(this.count === 1 ? this.itemName : this.itemNamePlural || this.itemName || 'items');

	this.heatmap.add(data);
	// this.addMarker(data); // Markers are very, very slow
};

App.prototype.addMarker = function(data) {
	// Create a new marker instance
	var marker = new gt.Marker({
		user: data.user,
		tweet: data.tweet,
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

App.prototype.loadData = function(data) {
	var locations = data.locations;
	var latestDate = Object.keys(data.days).pop();
	var latestLocations = data.days[latestDate];
	console.log('Showing data for %s', latestDate);
	for (var locationData of latestLocations) {
		var location = locations[locationData.id];
		var cases = locationData.cases;
		if (cases) {
			var size = ((Math.log(locationData.cases) / Math.log(1.5)) + 1) * 4.5;
			var intensity = 0.7;
			var locationString = (location['Province/State'] ? location['Province/State'] + ', ' : '') + location['Country/Region']
			console.log(locationString + ':', locationData.cases + ' cases', 'at', location.Lat + ',' + location.Long, 'with size ' + size);
			this.add({
				total: cases,
				location: [location.Lat, location.Long],
				size: size,
				intensity: intensity
			});
		}
	}
};

App.prototype.fetchData = function() {
	var app = this;
	var req = new XMLHttpRequest();
	req.addEventListener('load', function() {
		var data = JSON.parse(req.responseText);
		app.loadData(data);
	});
	req.open('GET', 'data/data.json');
	req.send();
};

App.prototype.addStats = function() {
	this.stats = new Stats();
	this.stats.domElement.className = 'gt_stats gt_bottom gt_left';
	this.container.appendChild(this.stats.domElement);
};

export default App;
