import * as THREE from 'three';
import util from './gt.util.js';
import WebGLHeatmap from './lib/webgl-heatmap.js';

const Heatmap = function(options) {
	util.extend(this, this.constructor.defaults, options);

	// Invert decay factor
	this.decayFactor = this.decayFactor === 0 ? 0 : 1 - this.decayFactor;

	this.lastUpdate = 0;

	this.canvas = document.createElement('canvas');

	// Load gradient
	let gradientImage = new Image();
	gradientImage.src = require('url:../../textures/heatmap-gradient.png');
	Heatmap.colors.pinkToYellow = gradientImage;

	// Store color ahead of initialization
	this.heatmap = new WebGLHeatmap({
		canvas: this.canvas,
		width: this.width,
		height: this.height,
		gradientTexture: Heatmap.colors[this.color],
		intensityToAlpha: true
	});

	// Add listener after we initialize heatmap, or we add data too soon
	gradientImage.addEventListener('load', () => {
		this.ready();
	});

	// Create a texture
	var texture = this.texture = new THREE.Texture(this.canvas);

	// Pick up a few FPS with constant texture updates
	// Via https://github.com/mrdoob/three.js/issues/2233
	texture.premultiplyAlpha = true;

	// Setup mesh
	this.geometry = new THREE.SphereGeometry(this.radius, 64, 64);
	this.material = new THREE.MeshPhongMaterial({
		map: this.texture,
		transparent: true,
		depthWrite: false
	});
	this.mesh = new THREE.Mesh(this.geometry, this.material);
	this.mesh.name = 'Heatmap';

	// Since the heatmap is static, disable auto-updating of its matrix
	this.mesh.matrixAutoUpdate = false;
	this.mesh.updateMatrix();

	// Add to scene
	this.scene.add(this.mesh);
};

Heatmap.defaults = {
	radius: 200,
	width: 4096,
	height: 2048,
	fps: 32,
	size: 20,
	intensity: 0.03,
	doBlur: false,
	decayFactor: 0,
	color: 'pinkToYellow'
};

Heatmap.colors = {
	'greenToRed': null,
	'pinkToYellow': null
};

Heatmap.prototype.add = function(data) {
	var pos = util.latLongTo2dCoordinate(data.coordinates[1], data.coordinates[0], this.width, this.height)
	if (pos.x === 0) {
		console.error('Got 0,0 coordinates', data)
	}
	this.heatmap.addPoint(pos.x, pos.y, data.size || this.size, data.intensity || this.intensity);
};

Heatmap.prototype.setColor = function(color) {
	if (Heatmap.colors[color] !== undefined) {
		this.color = color;
		this.heatmap.setGradientTexture(Heatmap.colors[color]);
	}
};

/*
	Call after points are added
*/
Heatmap.prototype.update = function() {
	// Tell THREE to update the texture from the canvas
	// Commented out due to smooth hack
	this.texture.needsUpdate = true;

	this.heatmap.update();
	this.heatmap.display();
};

Heatmap.prototype.clear = function(data) {
	this.heatmap.clear();
	this.heatmap.update();
	this.heatmap.display();
};

Heatmap.prototype.animate = function(timeDiff, time) {
	if (time - this.lastUpdate < 1000/this.fps) return;

	this.lastUpdate = time;

	// Smooth hack: In order to make the heatmap smoothly decay
	// We must add a dummy point
	this.heatmap.addPoint(0, 0, 0, 0);
	this.texture.needsUpdate = true;

	// TODO: Do blur and decay consistently for lower FPS
	if (this.doBlur)
		this.heatmap.blur();

	if (this.decayFactor)
		this.heatmap.multiply(this.decayFactor);

	this.heatmap.update();
	this.heatmap.display();
};

export default Heatmap;
