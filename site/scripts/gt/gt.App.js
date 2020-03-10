import util from './gt.util.js';
import * as THREE from 'three';
import OrbitControls from 'three-orbitcontrols';
import Globe from './gt.Globe.js';
import Skybox from './gt.Skybox.js';
import Marker from './gt.Marker.js';
import Heatmap from './gt.Heatmap.js';

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as TurfPoint, feature as TurfFeature } from '@turf/helpers';

import countries from '../../../data/ne_10m_admin_0_countries-4pct.json';
// import provinces from '../../../data/ne_10m_admin_1_states_provinces-10pct.json';

import config from '../../../data/config.json';
import cases from '../../data/cases.json';
import * as featureCollection from '../../data/features.json';
import * as points from '../../data/points.json';
import drawThreeGeo from './lib/threeGeoJSON.js';

window.THREE = THREE;

const App = function(options) {
	util.extend(this, App.defaults, options);
	this.el = (this.el && this.el.nodeType) || (this.el && document.querySelector(this.el)) || document.body;

	// Get args
	let args = util.getHashArgs();

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
	this.spinner = this.container.querySelector('.gt_spinner');
	this.indicator = this.container.querySelector('.gt_indicator');
	this.output = this.container.querySelector('.gt_output');
	this.typeSelectContainer = this.container.querySelector('.gt_forSelect');
	this.typeSelect = this.container.querySelector('.gt_typeSelect');
	this.pauseButton = this.container.querySelector('.gt_pauseButton');
	this.locationButton = this.container.querySelector('.gt_locationButton');
	this.slider = this.container.querySelector('.gt_dateSlider');
	this.aboutLayer = this.container.querySelector('.gt_aboutLayer');
	this.aboutButton = this.container.querySelector('.gt_aboutButton');
	this.datePicker = this.container.querySelector('.gt_datePicker');
	this.detailLayer = this.container.querySelector('.gt_detailLayer');
	this.menuLayer = this.container.querySelector('.gt_menuLayer');
	this.menuButton = this.container.querySelector('.gt_menuButton');
	this.tableButton = this.container.querySelector('.gt_tableButton');
	this.tableLayer = this.container.querySelector('.gt_tableLayer');
	this.settingsLayer = this.container.querySelector('.gt_settingsLayer');
	this.settingsButton = this.container.querySelector('.gt_settingsButton');

	if (this.menus === false) {
		this.typeSelectContainer.style.display = 'none';
	}

	// Shifty and unreliable way of detecting if we're on a mobile
	let isMobile = this.isMobile = ('ontouchstart' in document.documentElement);

	// Make a few things smaller on mobile
	if (this.isMobile) {
		this.tableLayer.classList.add('gt_layer--detail');
		this.detailLayer.classList.add('gt_layer--detail');
		this.detailLayer.classList.add('gt_layer--offset');
		this.detailLayer.classList.add('gt_layer--bottom');
		this.detailLayer.classList.add('gt_layer--left');
	}

	// It's very slow on mobiles, so assume touchscreens are mobiles and just update on change instead of move
	let sliderChangeEvent = isMobile ? 'change' : 'input';
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

	this.textureSelect = this.ui.querySelector('.gt_textureSelect')
	this.textureSelect.addEventListener('change', (evt) => {
		this.toggleOverlay(this.settingsLayer, null, false);
		let texture = evt.target.value;
		this.setTexture(texture);
		this.setHashFromParameters();
	});

	// Show clicked items in table
	this.tableLayer.addEventListener('click', (evt) => {
		let tr = evt.target.closest('tr');
		if (tr) {
			let featureId = tr.getAttribute('data-featureId');
			if (featureId) {
				let feature = featureCollection.features[featureId];
				if (feature) {
					this.rotateTo(feature.properties.coordinates);

					this.showInfoForFeature(feature);

					this.showFeature(feature);
				}
			}
		}
	});

	this.menuButton.addEventListener('click', (evt) => {
		this.toggleOverlay(this.menuLayer, this.menuButton);
	});

	// Close menu on click
	this.menuLayer.addEventListener('click', (evt) => {
		this.toggleOverlay(this.menuLayer, this.menuButton, false);
	});

	this.settingsButton.addEventListener('click', (evt) => {
		this.toggleOverlay(this.settingsLayer, null);
	});

	this.tableButton.addEventListener('click', (evt) => {
		this.toggleOverlay(this.tableLayer, this.tableButton);
	});

	// Show info overlay
	this.aboutButton.addEventListener('click', (evt) => {
		this.toggleOverlay(this.aboutLayer, null, true);
	});

	// Hide overlay
	this.ui.addEventListener('click', (evt) => {
		if (evt.target.classList.contains('gt_overlay')) {
			this.toggleOverlay(evt.target, null, false);
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
	this.ambientLight = new THREE.AmbientLight(0x222222, 7);
	scene.add(this.ambientLight);

	var cameraLight = new THREE.PointLight(0xFFFFFF, 1, 750);
	cameraLight.position.set(0, 0, this.cameraDistance);
	camera.add(cameraLight);

	// Add controls
	this.controls = new OrbitControls(this.camera, this.container);
	this.controls.minDistance = 225;
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
		// cloudRadius: this.cloudRadius,
		cloudSpeed: this.cloudSpeed,
		loaded: this.handleLoaded.bind(this),
		texture: args.texture
	});

	let rayCaster = new THREE.Raycaster();
	let mousePosition = new THREE.Vector2();
	this.canvas.addEventListener(isMobile ? 'touchend' : 'mousemove', (evt) => {
		evt.preventDefault();

		if (isMobile) {
			mousePosition.x = (evt.changedTouches[0].clientX / this.canvas.width) * 2 - 1;
			mousePosition.y = -(evt.changedTouches[0].clientY / this.canvas.height) * 2 + 1;
		}
		else {
			mousePosition.x = (evt.clientX / this.canvas.width) * 2 - 1;
			mousePosition.y = -(evt.clientY / this.canvas.height) * 2 + 1;
		}

		rayCaster.setFromCamera(mousePosition, camera);
		var intersects = rayCaster.intersectObject(this.globe.globeMesh);

		if (intersects.length > 0) {
			let vec3 = intersects[0].point
			let coordinates = util.vector3ToLatLong(vec3);
			let feature = this.drawFeatureAtCoordinates(coordinates);
			if (feature) {
				this.showInfoForFeature(feature, [evt.clientX, evt.clientY]);
			}
			else {
				this.hideInfo();
			}
		}
		else {
			this.hideInfo();
		}
	});

	this.canvas.addEventListener(isMobile ? 'touchstart' : 'mousedown', (evt) => {
		this.toggleOverlay(this.menuLayer, this.menuButton, false);
	});

	// Add skybox
	this.skybox = new Skybox({
		scene: scene
	});

	// Add heatmap
	this.heatmap = new Heatmap({
		scene: scene,
		radius: this.earthRadius,
		ready: () => {
			this.showData();
		}
	});

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
			this.rotateTo([114.3055, 30.5928]);
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
	window.addEventListener('resize', this.handleWindowResize.bind(this));
	window.addEventListener('blur', this.handleBlur.bind(this));
	window.addEventListener('focus', this.handleFocus.bind(this));

	// Start animation
	this.animate(0);

	// Draw features
	this.featureContainer = new THREE.Object3D();
	this.scene.add(this.featureContainer);
	if (this.drawFeatureLines) {
		this.drawFeatures();
	}
};

App.defaults = {
	fps: false,
	menus: true,
	earthRadius: 200,
	markerRadius: 200,
	cloudRadius: 200.5,
	cloudSpeed: 0.000003,
	cameraDistance: 500,
	pauseOnBlur: false,
	realtimeHeatmap: false,
	animateSun: false,

	drawFeatureLines: true,

	watchGPS: false,
	startAtGPS: false,
	dateHoldTime: 150,

	type: 'cases',

	itemName: 'item',
	itemNamePlural: 'items'
};

App.detailTemplate = function(info) {
	return `
	<div class="gt_output">
		<h3 class="gt_heading" id="detailTitle">${info.name}</h3>
		<dl class="gt_descriptionList" id="detailDescription">
			<div class="gt_descriptionList-row">
				<dt>Population</dt>
				<dd>${info.population ? info.population.toLocaleString() : '-'}</dd>
			</div>
			<div class="gt_descriptionList-row">
				<dt>Infection Rate</dt>
				<dd>${info.population ? info.rate.toFixed(8) : '-'}%</dd>
			</div>
			<div class="gt_descriptionList-row">
				<dt>Infected Ratio</dt>
				<dd>${info.population ? util.getRatio(info.active, info.population) : '-'}</dd>
			</div>
			<div class="gt_descriptionList-row">
				<dt>Cases</dt>
				<dd>${info.cases.toLocaleString()}</dd>
			</div>
			<div class="gt_descriptionList-row">
				<dt>Recovered</dt>
				<dd>${info.recovered.toLocaleString()}</dd>
			</div>
			<div class="gt_descriptionList-row">
				<dt>Deaths</dt>
				<dd>${info.deaths.toLocaleString()}</dd>
			</div>
			<div class="gt_descriptionList-row">
				<dt>Active</dt>
				<dd>${info.active.toLocaleString()}</dd>
			</div>
		</dl>
	</div>
`;
}

App.dataTableTemplate = function(title, columns, data, callback) {
	let html = `
	<div class="gt_output">
		<h3 class="gt_heading" id="detailTitle">${title}</h3>
		<table class="gt_dataTable gt_dataTable--interactive">
			<thead>
`;
	for (let column of columns) {
		html += `
				<th>${column}</th>
`;
	}
	html += `
			</thead>
			<tbody>
`;
	for (let [index, row] of Object.entries(data)) {
		let rowHTML = `
			<tr class="gt_dataTable-row">
`;
		for (let column of row) {
		rowHTML += `
				<td>${column}</td>
`;
		}
		rowHTML += `
			</tr>
`;
		if (callback) {
			rowHTML = callback(rowHTML, row, index);
		}
		html += rowHTML;
	}
	html += `
			</tbody>
		</table>
	</div>
`;

	return html;
}

App.prototype.showFeature = function(feature) {
	// Hide the last feature
	if (this._lastShownFeature) {
		if (this._lastShownFeature.border) {
			this._lastShownFeature.border.visible = false;
		}
	}

	if (feature.border) {
		feature.border.visible = true;
	}
	else {
		// Cache border
		feature.border = new THREE.Group();
		feature.border.name = feature.properties.name;
		this.featureContainer.add(feature.border);
		drawThreeGeo(feature, this.earthRadius, 'sphere', {
			color: 'rgb(220, 220, 220)',
			opacity: 1,
			transparent: true
		}, feature.border);
	}
	this._lastShownFeature = feature;
};

App.prototype.setTexture = function(texture) {
	if (this.globe.texture != texture) {
		this.globe.setTexture(texture);
	}
	this.textureSelect.value = this.globe.texture;
};

App.prototype.hideInfo = function() {
	this.detailLayer.hidden = true;
	this.lastInfoFeature = null;
};

App.prototype.showInfoForFeature = function(feature, location) {
	if (!feature) {
		feature = this.lastInfoFeature;
	}

	if (!feature) {
		return;
	}

	if (!location) {
		location = [this.canvas.offsetLeft + this.canvas.width / 2, this.canvas.offsetTop + this.canvas.height / 2];
	}

	this.detailLayer.hidden = false;
	if (!this.isMobile) {
		if (location) {
			this.detailLayer.style.left = location[0] + 'px';
			this.detailLayer.style.top = location[1] + 'px';
		}
	}
	this.detailLayer.focus();

	if (this.lastInfoDate === this.date && this.lastInfoFeature === feature) {
		// Don't recalculate or redraw
		return;
	}

	let info = Object.assign({
		name: feature.properties.name,
		population: feature.properties.pop_est
	}, cases[this.date][feature.properties.id]);

	this.detailLayer.innerHTML = App.detailTemplate(info);

	this.lastInfoDate = this.date;
	this.lastInfoFeature = feature;
};

App.prototype.hideFeature = function(feature) {
	if (feature.border) {
		feature.border.visible = false;
	}
};

App.prototype.drawFeatureAtCoordinates = function(coordinates) {
	let point = TurfPoint(coordinates);
	let foundFeature = null;
	for (let feature of featureCollection.features) {
		// Cache feature
		feature.turfFeature = feature.turfFeature || TurfFeature(feature.geometry);
		if (booleanPointInPolygon(point, feature.turfFeature)) {
			foundFeature = feature;
			this.showFeature(feature);
			continue;
		}

		// Hide everything else
		this.hideFeature(feature);
	}
	return foundFeature;
};

App.prototype.drawFeatures = function() {
	// Draw provinces
	// drawThreeGeo(provinces, this.earthRadius, 'sphere', {
	// 	color: 'rgb(0, 0, 0)',
	// 	opacity: 0.95,
	// 	transparent: true,
	// }, this.featureContainer);

	drawThreeGeo(countries, this.earthRadius, 'sphere', {
		color: 'rgb(0, 0, 0)',
		opacity: 0.7,
		transparent: true
	}, this.featureContainer);

	// Draw infected regions
	/*
	drawThreeGeo(featureCollection, this.earthRadius, 'sphere', {
		color: 'rgb(0, 0, 0)',
		opacity: 0.95,
		transparent: true,
	}, this.featureContainer);
	*/
};

// Animation
App.prototype.animate = function(time) {
	var timeDiff = time - this.lastTime;
	this.lastTime = time;

	// Update hooked functions
	this.controls.update();
	this.globe.update(timeDiff, time);

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

	// Only update the heatmap if its real-time
	if (this.realtimeHeatmap)
		this.heatmap.animate(timeDiff, time);

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
	navigator.geolocation.getCurrentPosition((pos) => {
		let coordinates = [pos.coords.longitude, pos.coords.latitude];
		this.rotateTo(coordinates);

		let feature = this.drawFeatureAtCoordinates(coordinates);
		if (feature) {
			this.showInfoForFeature(feature);
		}
	});
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
		this.rotateTo([long, lat]);
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

	if (args.texture) {
		this.setTexture(args.texture);
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
		long: long,
		texture: this.globe.texture
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

App.prototype.rotateTo = function(coordinates) {
	// TODO: Animate rotation smoothly
	let vec3 = util.latLongToVector3(coordinates[1], coordinates[0], this.cameraDistance);
	this.camera.position.copy(vec3);
	this.camera.lookAt(this.scene.position);
};

App.prototype.showSpinner = function(type) {
	this.spinner.hidden = false;
};

App.prototype.hideSpinner = function(type) {
	this.spinner.hidden = true;
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
	this.pauseButton.firstElementChild.classList.remove('gt_icon--pause');
	this.pauseButton.firstElementChild.classList.add('gt_icon--play');
	this.playing = false;
	this.setHashFromParameters();
};

App.prototype.play = function() {
	this.pauseButton.firstElementChild.classList.remove('gt_icon--play');
	this.pauseButton.firstElementChild.classList.add('gt_icon--pause');
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
		let coordinates = [pos.coordinates.longitude, pos.coordinates.latitude];
		this.rotateTo(coordinates);
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

App.prototype.toggleOverlay = function(overlay, button, force) {
	let show;
	if (force !== undefined) {
		show = force;
	}
	else {
		show = overlay.hidden;
	}
	overlay.hidden = !show;
	if (button) {
		button.classList.toggle('is-selected', show);
	}
};

App.prototype.updateRateTable = function(date) {
	date = date || this.date;

	let rateOrder = [];
	for (let featureId in cases[date]) {
		let info = cases[date][featureId];
		if (info.rate && info.active > config.minCasesForSignifigance) {
			let feature = featureCollection.features[featureId];
			rateOrder.push(Object.assign({
				name: feature.properties.name,
				population: feature.properties.pop_est,
				featureId: featureId
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

	let rates = rateOrder.map((info, index) => [
		`${index + 1}. ${info.name}`,
		info.active.toLocaleString(),
		util.getRatio(info.active, info.population)
	]);

	rates = rates.slice(0, this.isMobile ? config.topLocationsCount : config.topLocationsCount * 2);

	this.tableLayer.innerHTML = App.dataTableTemplate(
		'Rate of Infection',
		['Location', 'Cases', 'Ratio'],
		rates,
		(html, row, index) => {
			return html.replace('<tr>', `<tr data-featureId="${rateOrder[index].featureId}">`);
		}
	);
}

App.prototype.showData = function(type, date) {
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

	let latestCasesByRegion = cases[date];
	let count = 0;
	for (let featureId in latestCasesByRegion) {
		let feature = featureCollection.features[featureId];
		let caseInfo = latestCasesByRegion[featureId];
		let location = featureCollection.features[featureId];
		let cases = caseInfo[type];
		if (cases) {
			if (points[featureId]) {
				// Location has enough cases to have randomly distributed clusters
				let clusterCount = Math.round(cases / config.caseDivisor);
				let size = 2.5;
				let intensity = 1;
				let infectionPercent = 0;
				let population = location.properties.pop_est;
				if (population) {
					infectionPercent = cases / population;
				}

				if (population) {
					console.log('  %s: %d %s out of %d population (%s %) (%d points of %dpx and %f intensity)', feature.properties.name, cases, type, population, infectionPercent.toFixed(8), clusterCount, size, intensity);
				}
				else {
					console.log('  %s: %d %s (%d points of %dpx and %f intensity)', feature.properties.name, cases, type, clusterCount, size, intensity);
				}

				for (let i = 0; i < clusterCount && i < points[featureId].length; i++) {
					let coordinates = points[featureId][i];
					if (!coordinates) {
						console.warn('%s: Could not find random point at index %d, we only have %d points', feature.properties.name, i, points[featureId].length);
						coordinates = location.coordinates;
					}
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
				console.log('  %s: %d %s (1 point of %dpx and %f intensity)', feature.properties.name, cases, type, size, intensity);

				this.add({
					coordinates: feature.properties.coordinates,
					size: size,
					intensity: intensity
				});
			}

			count += cases;
		}
	}

	// this.countEl.innerText = count.toLocaleString()+' '+(count === 1 ? this.itemName : this.itemNamePlural || this.itemName || 'items');
	this.countEl.innerText = count.toLocaleString();

	// Update data
	this.showInfoForFeature();

	// Update table
	this.updateRateTable();

	this.heatmap.update();
};

export default App;
