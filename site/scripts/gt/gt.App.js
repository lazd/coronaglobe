import util from './gt.util.js';
import * as THREE from 'three';
import OrbitControls from 'three-orbitcontrols';
import Globe from './gt.Globe.js';
import Skybox from './gt.Skybox.js';
import Marker from './gt.Marker.js';
import Heatmap from './gt.Heatmap.js';

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as TurfPoint, feature as TurfFeature } from '@turf/helpers';

import countries from '../../../coronavirus-data-sources/geojson/world-countries.json';
// import provinces from '../../../data/ne_10m_admin_1_states_provinces-10pct.json';

import config from '../../../data/config.json';
import cases from '../../../coronadatascraper/timeseries.json';
import locations from '../../../coronadatascraper/locations.json';
import * as featureCollection from '../../../coronadatascraper/features.json';
// import * as points from '../../data/points.json';
import drawThreeGeo from './lib/three3DGeoJSON.js';

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
			this.dateSet = true;
			this.pause();
		}
	});

	if (sliderChangeEvent !== 'input') {
		// Update the date while dragging on mobile
		this.slider.addEventListener('input', () => {
			let dateIndex = this.slider.value;
			let dateString = Object.keys(cases)[dateIndex];
			if (dateString) {
				this.datePicker.value = util.formatDateForInput(dateString);
			}
		});
	}

	this.datePicker.addEventListener('input', () => {
		if (this.datePicker.value) {
			let dateString = util.formatDateForDataset(this.datePicker.value);
			if (dateString) {
				this.setDate(dateString);
				this.dateSet = true;
				this.pause();
			}
		}
	});

	// Settings inputs
	// this.textureSelect = this.ui.querySelector('.gt_textureSelect')
	// this.textureSelect.addEventListener('change', (evt) => {
	// 	this.toggleOverlay(this.settingsLayer, null, false);
	// 	let texture = evt.target.value;
	// 	this.setStyle(texture);
	// 	this.setHashFromParameters();
	// });

	this.heatmapColorSelect = this.ui.querySelector('.gt_heatmapColorSelect')
	this.heatmapColorSelect.addEventListener('change', (evt) => {
		this.toggleOverlay(this.settingsLayer, null, false);
		let color = evt.target.value;
		this.setHeatmapColor(color);
		this.heatmapColorSet = true;
		this.showData();
		this.setHashFromParameters();
	});

	this.choroplethStyleSelect = this.ui.querySelector('.gt_choroplethStyleSelect')
	this.choroplethStyleSelect.addEventListener('change', (evt) => {
		this.toggleOverlay(this.settingsLayer, null, false);
		let style = evt.target.value;
		this.setChoroplethStyle(style);
		this.choroplethStyleSet = true;
		this.showData();
		this.setHashFromParameters();
	});

	this.mapStyleLayer = this.ui.querySelector('.gt_mapStyleLayer');
	this.mapStyleButton = this.ui.querySelector('.gt_mapStyleButton');
	this.mapStyleButton.addEventListener('click', (evt) => {
		this.toggleOverlay(this.mapStyleLayer, this.mapStyleButton);
	});

	this.mapStyleMenu = this.ui.querySelector('.gt_mapStyleMenu');
	this.mapStyleMenu.addEventListener('click', (evt) => {
		let button = evt.target.closest('button');
		let style = button.getAttribute('data-value');
		this.toggleOverlay(this.mapStyleLayer, this.mapStyleButton, false);
		this.setStyle(style);
		this.styleSet = true;
		this.showData();
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
					this.goToFeature(feature);
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

	const searchTemplate = (results) => {
		let html = `<div class="gt_menu">`;
		// results

		for (let [index, feature] of Object.entries(results)) {
			html += `<a class="gt_button${index == "0" ? ' is-highlighted' : ''}" data-featureId="${feature.properties.locationId}" href="#">${feature.properties.name}</a>`;
		}
		if (!results.length) {
			html += '<div class="gt_message">No results.</div>';
		}

		html += `</div>`;
		return html;
	};

	// Search bits
	this.searchForm = this.ui.querySelector('.gt_search');
	this.searchResults = this.ui.querySelector('.gt_searchResults');
	this.searchLayer = this.ui.querySelector('.gt_searchLayer');
	this.searchInput = this.ui.querySelector('.gt_search-input');

	// Navigate to search results
	this.searchResults.addEventListener('click', (evt) => {
		let tr = evt.target.closest('a');
		if (tr) {
			let featureId = tr.getAttribute('data-featureId');
			if (featureId) {
				let feature = featureCollection.features[featureId];
				if (feature) {
					this.toggleOverlay(this.searchLayer, null, false);
					this.goToFeature(feature);
				}
			}
		}
	});

	// Navigate around search results
	const navigateKeys = {
		'ArrowDown': (index, length) => {
			return index + 1;
		},
		'ArrowUp': (index, length) => {
			return index - 1;
		},
		'Home': (index, length) => {
      return 0;
    },
    'End': (index, length) => {
      return length - 1;
    }
	};
	this.searchResults.addEventListener('keydown', (evt) => {
		if (evt.key === 'Escape') {
			this.searchInput.focus();
			return;
		}

		let navigateFunc = navigateKeys[evt.key];
		if (navigateFunc) {
			let results = Array.prototype.slice.call(this.searchResults.querySelectorAll('a'));
			let currentIndex = results.indexOf(evt.target);
			currentIndex = navigateFunc(currentIndex, results.length);
			if (currentIndex < 0) {
				currentIndex = results.length - 1;
			}
			else if (currentIndex > results.length - 1) {
				currentIndex = 0;
			}
			evt.preventDefault();
			if (results[currentIndex]) {
				results[currentIndex].focus();
			}
		}
	});

	const removeResultHighlight = (evt) => {
		let anchor = this.searchResults.querySelector('a.is-highlighted');
		if (anchor) {
			anchor.classList.remove('is-highlighted');
		}
	};
	this.searchResults.addEventListener('focusin', removeResultHighlight);
	this.searchResults.addEventListener('mouseover', removeResultHighlight);

	// Handle search input
	this.searchInput.addEventListener('keydown', (evt) => {
		if (evt.key === 'Escape' && this.searchInput.value === '') {
			this.toggleOverlay(this.searchLayer, null, false);
			return;
		}
		else if (evt.key === 'ArrowDown') {
			let firstResult = this.searchResults.querySelector('a');
			if (firstResult) {
				evt.preventDefault();
				firstResult.focus();
			}
		}
	});
	this.searchInput.addEventListener('input', (evt) => {
		let results = this.search(this.searchInput.value.trim().toLowerCase());
		this.searchResults.innerHTML = searchTemplate(results);
	});
	this.searchForm.addEventListener('submit', (evt) => {
		evt.preventDefault();

		// Go to first result
		let results = this.search(this.searchInput.value.trim().toLowerCase());
		if (results.length) {
			this.toggleOverlay(this.searchLayer, null, false);
			this.goToFeature(results[0]);
		}
	});

	// Show search
	this.ui.addEventListener('click', (evt) => {
		let button = evt.target.closest('button');
		if (button && button.classList.contains('gt_showSearch')) {
			this.toggleOverlay(this.searchLayer, null, true);
			this.searchInput.focus();
			this.toggleOverlay(this.menuLayer, this.menuButton, false);
			this.toggleOverlay(this.mapStyleLayer, this.mapStyleButton, false);
		}
	});

	// Hide overlay
	this.ui.addEventListener('click', (evt) => {
		if (evt.target.classList.contains('gt_overlay')) {
			this.toggleOverlay(evt.target, null, false);
		}

		let button = evt.target.closest('button');
		if (button && button.classList.contains('gt_closeOverlay')) {
			let overlay = button.closest('.gt_overlay');
			this.toggleOverlay(overlay, null, false);
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
		this.typeSet = true;
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
	// camera.add(cameraLight);

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
		cloudSpeed: this.cloudSpeed,
		loaded: this.handleLoaded.bind(this),
		// texture: args.texture,
		style: 'basic'
	});

	let rayCaster = new THREE.Raycaster();
	let mousePosition = new THREE.Vector2();
	this.canvas.addEventListener(isMobile ? 'touchend' : 'mousemove', (evt) => {
		evt.preventDefault();

		if (this.persistFeatureInfo) {
			return;
		}

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
			let feature = this.getFeatureAtCoordinates(coordinates);
			if (feature) {
				this.showInfoForFeature(feature, [evt.clientX, evt.clientY]);
				this.highlightFeature(feature);
			}
			else {
				this.unhighlightFeature();
				this.hideInfo();
			}
		}
		else {
			this.unhighlightFeature();
			this.hideInfo();
		}
	});

	this.canvas.addEventListener(isMobile ? 'touchstart' : 'mousedown', (evt) => {
		this.toggleOverlay(this.menuLayer, this.menuButton, false);
		this.toggleOverlay(this.mapStyleLayer, this.mapStyleButton, false);
	});

	// Add skybox
	this.skybox = new Skybox({
		scene: scene
	});

	// Add heatmap
	this.heatmap = new Heatmap({
		scene: scene,
		radius: this.earthRadius,
		color: args.heatmapColor || this.heatmapColor,
		ready: () => {
			this.showData();
		}
	});

	// Draw base features
	this.featureContainer = new THREE.Object3D();
	this.scene.add(this.featureContainer);
	this.drawBaseFeatures();

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

	// Add listeners
	window.addEventListener('popstate', this.setParametersFromHash.bind(this));
	window.addEventListener('resize', this.handleWindowResize.bind(this));
	window.addEventListener('blur', this.handleBlur.bind(this));
	window.addEventListener('focus', this.handleFocus.bind(this));

	this.setParametersFromHash();

	// Start animation
	this.animate(0);
};

App.defaults = {
	fps: false,
	menus: true,
	earthRadius: 200,
	markerRadius: 200,
	cloudSpeed: 0.000003,
	cameraDistance: 500,
	pauseOnBlur: false,
	realtimeHeatmap: false,
	animateSun: false,

	watchGPS: false,
	startAtGPS: false,
	dateHoldTime: 150,

	type: 'cases',

	itemName: 'item',
	itemNamePlural: 'items',

	choroplethStyle: 'rankAdjustedRatio',
	heatmapColor: 'pinkToYellow',

	style: 'choropleth'
};

App.detailTemplate = function(info) {
	return `
	<div class="gt_output">
		<h3 class="gt_heading" id="detailTitle">${info.name}</h3>
		<dl class="gt_descriptionList" id="detailDescription">
			${
				info.population ?
				`
				<div class="gt_descriptionList-row">
					<dt>Population</dt>
					<dd>${info.population ? info.population.toLocaleString() : '-'}</dd>
				</div>
				<div class="gt_descriptionList-row">
					<dt>Infected Ratio</dt>
					<dd>${info.population ? util.getRatio(info.active, info.population) : '-'}</dd>
				</div>
				` : ''
			}
			${
				info.cases ?
				`<div class="gt_descriptionList-row">
					<dt>Cases</dt>
					<dd>${info.cases.toLocaleString()}</dd>
				</div>` : ''
			}
			${
				info.recovered ?
				`<div class="gt_descriptionList-row">
					<dt>Recovered</dt>
					<dd>${info.recovered.toLocaleString()}</dd>
				</div>` : ''
			}
			${
				info.deaths ?
				`<div class="gt_descriptionList-row">
					<dt>Deaths</dt>
					<dd>${info.deaths.toLocaleString()}</dd>
				</div>`: ''
			}
			${
				info.active ?
				`<div class="gt_descriptionList-row">
					<dt>Active</dt>
					<dd>${info.active.toLocaleString()}</dd>
				</div>`: ''
			}
		</dl>
	</div>
`;
}

App.dataTableTemplate = function(title, columns, data, callback) {
	let html = `
	<div class="gt_output">
`;

	if (title) {
		html += `
			<h3 class="gt_heading" id="detailTitle">${title}</h3>
		`;
	}

	html += `
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
		for (let i = 0; i < columns.length; i++) {
			let column = row[i];
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

App.styles = {
	'heatmap': true,
	'choropleth': true
};

App.lineColor = new THREE.Color('white');
App.lineHighlightColor = new THREE.Color('black');

App.lineMaterial = new THREE.LineBasicMaterial({
	linewidth: 1,
	color: App.lineColor
});

App.meshMaterial = new THREE.MeshLambertMaterial({
  side: THREE.BackSide,
	depthTest: false
});

App.prototype.drawFeature = function(feature, options = {}) {
	if (feature.mapItems) {
		if (options.color) {
			feature.meshMaterial.color.set(options.color);
		}
	}
	else {
		// Cache border
		feature.mapItems = new THREE.Group();
		feature.mapItems.name = feature.properties.name;
		this.featureContainer.add(feature.mapItems);

		let meshMaterial = App.meshMaterial.clone();
		meshMaterial.color = options.color || new THREE.Color('pink');
		let lineMaterial = App.lineMaterial.clone();
		drawThreeGeo(feature, this.earthRadius, 'sphere', {
			meshMaterial: meshMaterial,
			lineMaterial: lineMaterial
		}, feature.mapItems);

		feature.meshMaterial = meshMaterial;
		feature.lineMaterial = lineMaterial;
	}
	this._lastShownFeature = feature;
};


App.prototype.goToFeature = function(feature) {
	if (feature) {
		this.rotateTo(feature.properties.coordinates);

		this.showInfoForFeature(feature, null, true);

		this.highlightFeature(feature);
	}
};

App.prototype.search = function(searchString) {
	let results = [];
	for (let feature of featureCollection.features) {
		if (feature.properties.name.toLowerCase().match(searchString)) {
			results.push(feature);
		}
	}
	return results;
};

App.prototype.setChoroplethStyle = function(style) {
	if (!style) {
		return;
	}

	if (App.choroplethStyles[style]) {
		this.choroplethStyle = style;
		this.choroplethStyleSelect.value = style;
	}
};

App.prototype.setStyle = function(style) {
	if (App.styles[style]) {
		this.style = style;
		if (style === 'choropleth') {
			this.globe.setStyle('basic');
			this.mapStyleButton.firstElementChild.classList.remove('gt_icon--heatmap');
			this.mapStyleButton.firstElementChild.classList.add('gt_icon--choropleth');
		}
		else {
			this.globe.setStyle('realistic');
			this.mapStyleButton.firstElementChild.classList.remove('gt_icon--choropleth');
			this.mapStyleButton.firstElementChild.classList.add('gt_icon--heatmap');
		}

		this.mapStyleMenu.querySelector(`button[data-value="${style}"]`).classList.add('is-selected');
		for (let otherButton of this.mapStyleMenu.querySelectorAll(`button:not([data-value="${style}"])`)) {
			otherButton.classList.remove('is-selected');
		}
	}
};

App.prototype.setHeatmapColor = function(color) {
	if (!color) {
		return;
	}

	this.heatmap.setColor(color);
	this.heatmapColorSelect.value = color;
};

App.prototype.hideInfo = function() {
	this.detailLayer.hidden = true;
	this.lastInfoFeature = null;
};

App.prototype.showInfoForFeature = function(feature, screenCoordinates, persist) {
	if (!feature) {
		feature = this.lastInfoFeature;
	}

	if (!feature) {
		return;
	}

	if (persist) {
		this.persistFeatureInfo = persist;
		clearTimeout(this._featurePersistTimeout);
		this._featurePersistTimeout = setTimeout(() => {
			this.persistFeatureInfo = false;
		}, 2000);
	}

	if (!screenCoordinates) {
		screenCoordinates = [this.canvas.offsetLeft + this.canvas.width / 2, this.canvas.offsetTop + this.canvas.height / 2];
	}

	this.detailLayer.hidden = false;
	if (!this.isMobile) {
		if (screenCoordinates) {
			this.detailLayer.style.left = screenCoordinates[0] + 'px';
			this.detailLayer.style.top = screenCoordinates[1] + 'px';
		}
	}
	this.detailLayer.focus();

	if (this.lastInfoDate === this.date && this.lastInfoFeature === feature) {
		// Don't recalculate or redraw
		return;
	}

	let location = locations[feature.properties.locationId];

	let info = Object.assign({}, location, cases[this.date][feature.properties.locationId]);

	this.detailLayer.innerHTML = App.detailTemplate(info);

	this.lastInfoDate = this.date;
	this.lastInfoFeature = feature;
};

App.prototype.resetFeature = function(feature) {
	if (feature.meshMaterial) {
		feature.meshMaterial.color.set(App.choroplethColors[0].clone());
		feature.lineMaterial.color.set(App.lineColor);
	}
};

App.prototype.unhighlightFeature = function(feature = this._lastHighlightedFeature) {
	if (feature && feature.lineMaterial) {
		feature.lineMaterial.color.set(App.lineColor);

		let lines = feature.mapItems.getObjectByName('Lines');
		for (let line of lines.children) {
			line.renderOrder = 10000;
		}
	}
};

App.prototype.highlightFeature = function(feature) {
	this.unhighlightFeature();

	if (feature) {
		if (feature.lineMaterial) {
			feature.lineMaterial.color.set(App.lineHighlightColor);
			let lines = feature.mapItems.getObjectByName('Lines');
			for (let line of lines.children) {
				line.renderOrder = Infinity;
			}

			this._lastHighlightedFeature = feature;
		}
		else {
			console.error('Cannot highlight feature %s: it has not been drawn', feature.properties.name);
		}
	}
};

App.prototype.getFeatureAtCoordinates = function(coordinates) {
	let point = TurfPoint(coordinates);
	let foundFeature = null;
	for (let feature of featureCollection.features) {
		let location = locations[feature.properties.locationId];
		if (location.country === 'USA' && location.state && !location.county) {
			continue;
		}

		feature.turfFeature = feature.turfFeature || TurfFeature(feature.geometry);
		if (booleanPointInPolygon(point, feature.turfFeature)) {
			foundFeature = feature;
			break;
		}
	}
	return foundFeature;
};

App.prototype.drawBaseFeatures = function() {
	let material = new THREE.MeshLambertMaterial({
    side: THREE.BackSide,
		color: App.choroplethColors[0].clone(),
		depthTest: false
	});

	// Draw countries
	drawThreeGeo(countries, this.earthRadius, 'sphere', {
		meshMaterial: material,
		lineMaterial: App.lineMaterial
	}, this.featureContainer);

	// Draw all regions
	// drawThreeGeo(provinces, this.earthRadius, 'sphere', material, this.featureContainer);
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

		let feature = this.getFeatureAtCoordinates(coordinates);
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

	// if (args.texture) {
	// 	this.setStyle(args.texture);
	// }
	// else {
	// 	this.setStyle(this.style);
	// }

	if (args.heatmapColor) {
		this.heatmapColorSet = true;
		this.setHeatmapColor(args.heatmapColor);
	}
	else {
		this.setHeatmapColor(this.heatmapColor);
	}

	if (args.choroplethStyle) {
		this.choroplethStyleSet = true;
		this.setChoroplethStyle(args.choroplethStyle);
	}
	else {
		this.setChoroplethStyle(this.choroplethStyle);
	}

	if (args.style) {
		this.styleSet = true;
		this.setStyle(args.style);
	}
	else {
		this.setStyle(this.style);
	}

	if (args.date) {
		this.date = args.date;
		this.dateSet = true;
	}
	if (args.type) {
		this.type = args.type;
		this.typeSet = true;
	}

	this.showData();

	if (args.playing === 'true') {
		this.playingSet = true;
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
		playing: this.playingSet ? this.playing : null,
		date: this.dateSet ? this.date : null,
		type: this.typeSet ? this.type : null,
		lat: lat,
		long: long,
		// texture: this.textureSet ? this.globe.texture : null,
		heatmapColor: this.heatmapColorSet ? this.heatmap.color : null,
		choroplethStyle: this.choroplethStyleSet ? this.choroplethStyle : null,
		style: this.styleSet ? this.style : null
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

function getName(location) {
  let name = '';
  let sep = '';
  if (location.city) {
    name += location.county;
    sep = ', ';
  }
  if (location.county) {
    name += sep + location.county;
    sep = ', ';
  }
  if (location.state) {
    name += sep + location.state;
    sep = ', ';
  }
  if (location.country) {
    name += sep + location.country;
    sep = ', ';
  }
  return name;
}

App.prototype.getRateRanking = function(date, type, min = config.minCasesForSignifigance) {
	let rateOrder = [];
	for (let locationId in cases[date]) {

		let info = cases[date][locationId];
		let location = locations[locationId];
		let feature = featureCollection.features[location.featureId];

		// Skip states for now
		if (location.country === 'USA' && location.state && !location.county) {
			continue;
		}

		if (location.population && info[type] >= min) {
			rateOrder.push(Object.assign({
				name: getName(location),
				population: location.population,
				locationId: locationId,
				featureId: location.featureId
			}, info, {
				rate: info[type] / location.population
			}));
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

	return rateOrder;
}

App.prototype.updateRateTable = function(date, type) {
	date = date || this.date;
	type = type || this.type;

	let rateOrder = this.getRateRanking(date, type);

	let rates = rateOrder.map((info, index) => [
		`${index + 1}. ${info.name}`,
		info[type].toLocaleString(),
		util.getRatio(info[type], info.population),
		info.featureId
	]);


	let typeFormal = type.substr(0,1).toUpperCase() + type.substr(1);
	rates = rates.slice(0, this.isMobile ? config.topLocationsCount : config.topLocationsCount * 2);

	this.tableLayer.innerHTML = App.dataTableTemplate(
		`Population-adjusted Ranking`,
		['Location', typeFormal, 'Ratio'],
		rates,
		(html, row, index) => {
			return html.replace('<tr', `<tr data-featureId="${row[3]}"`);
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

	// console.log('🗓 %s', date);

	let latestCasesByLocation = cases[date];
	let count = 0;
	let targetColor = new THREE.Color(1, 0, 0);
	let worstAffectedPercent = 0;

	for (let [locationId, caseInfo] of Object.entries(latestCasesByLocation)) {
		let location = locations[locationId];
		let feature = featureCollection.features[location.featureId];
		if (feature) {
			feature.properties.locationId = locationId;
		}
		else {
			console.error('Cannot find feature for %s', getName(location));
		}

		// Skip states for now
		if (location.country === 'USA' && location.state && !location.county) {
			continue;
		}

		let caseCount = caseInfo[type];

		if (caseCount) {
			let affectedPercent = 0;
			let population = location.population
			if (population) {
				affectedPercent = caseCount / population;
			}
			else {
				console.error('No population data for %s!', getName(location));
			}

			if (affectedPercent > worstAffectedPercent) {
				worstAffectedPercent = affectedPercent;
			}

			if (this.style === 'heatmap') {
				if (false && points[featureId]) {
					// Location has enough cases to have randomly distributed clusters
					let clusterCount = Math.round(caseCount / config.caseDivisor);
					let size = 2.5;
					let intensity = 1;

					// if (population) {
					// 	console.log('  %s: %d %s out of %d population (%s %) (%d points of %dpx and %f intensity)', feature.properties.name, caseCount, type, population, affectedPercent.toFixed(8), clusterCount, size, intensity);
					// }
					// else {
					// 	console.log('  %s: %d %s (%d points of %dpx and %f intensity)', feature.properties.name, caseCount, type, clusterCount, size, intensity);
					// }

					for (let i = 0; i < clusterCount && i < points[featureId].length; i++) {
						let coordinates = points[featureId][i];
						if (!coordinates) {
							console.warn('%s: Could not find random point at index %d, we only have %d points', getName(location), i, points[featureId].length);
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
					// console.log('  %s: %d %s (1 point of %dpx and %f intensity)', feature.properties.name, caseCount, type, size, intensity);

					this.add({
						coordinates: location.coordinates,
						size: size,
						intensity: intensity
					});
				}
			}

			count += caseCount;
		}
	}

	// Update the heatmap no matter what
	this.heatmap.update();

	if (this.style === 'heatmap') {
		this.featureContainer.visible = false;
	}
	else if (this.style === 'choropleth') {
		this.featureContainer.visible = true;

		let ranks = this.getRateRanking(date, type, 1);
		for (let [index, info] of Object.entries(ranks)) {
			let feature = featureCollection.features[info.featureId];
			if (feature) {
				let location = locations[info.locationId];
				if (feature) {
					let scaledColorValue = App.choroplethStyles[this.choroplethStyle](info, type, ranks.length, index, worstAffectedPercent);

					this.drawFeature(feature, {
						color: util.getColorOnGradient(App.choroplethColors, scaledColorValue)
					});
				}
			}
			else {
				console.error('Cannot find feature for %s', info.name);
			}
		}

		for (let [featureId, feature] of Object.entries(featureCollection.features)) {
			if (!latestCasesByLocation[feature.properties.locationId] || !latestCasesByLocation[feature.properties.locationId][type]) {
				// this.drawFeature(feature, {
				// 	color: App.choroplethColors[0]
				// });
				this.resetFeature(feature);
			}
		}
	}

	// this.countEl.innerText = count.toLocaleString()+' '+(count === 1 ? this.itemName : this.itemNamePlural || this.itemName || 'items');
	this.countEl.innerText = count.toLocaleString();

	// Update data
	this.showInfoForFeature();

	// Update table
	this.updateRateTable();
};

App.prototype.drawGradientKey = function() {
	let container = document.createElement('div');
	container.style.position = 'absolute';
	container.style.left = '0';
	container.style.right = '0';
	container.style.top = '50%';
	container.style.display = 'flex';
	container.style.height = '40px';
	container.style.zIndex = '100px';
	for (var i = 0; i < 201; i++) {
		let sliver = document.createElement('div');
		sliver.style.backgroundColor = '#'+util.getColorOnGradient(App.choroplethColors, i / 200).getHexString();
		sliver.style.height = '40px';
		sliver.style.width = '2px';
		container.appendChild(sliver)
	}
	document.body.appendChild(container);
};

// App.choroplethColors = [
// 	new THREE.Color('#e7ff9d'),
// 	new THREE.Color('#edff9a'),
// 	new THREE.Color('#fffc00'),
// 	new THREE.Color('#ff7200'),
// 	new THREE.Color('#c52125'),
// ];

App.choroplethColors = [
	new THREE.Color('#eeffcd'),
	new THREE.Color('#b4ffa5'),
	new THREE.Color('#ffff00'),
	new THREE.Color('#ff7f00'),
	new THREE.Color('#ff0000'),
];

App.choroplethStyles =  {
	'pureRatio': function(info, type, total, rank, worstAffectedPercent) {
		// Color based on how bad it is, relative to the worst place
		let percentRatio = (info[type] / info.population) / worstAffectedPercent;

		return util.adjustTanh(percentRatio);
	},
	'rankAdjustedRatio': function(info, type, total, rank, worstAffectedPercent) {
		// Color based on rank
		let rankRatio = (total - rank) / total;

		// Color based on how bad it is, relative to the worst place
		let percentRatio = (info[type] / info.population) / worstAffectedPercent;

		let ratio = (rankRatio + percentRatio) / 2;

		return ratio
	},
	'rankRatio': function(info, type, total, rank, worstAffectedPercent) {
		// Color based on rank
		let rankRatio = (total - rank) / total;

		return rankRatio;
	}
};

export default App;
