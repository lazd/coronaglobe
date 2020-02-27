import * as THREE from 'three';
import util from './gt.util.js';
import WebGLHeatmap from './lib/webgl-heatmap.js';

const Heatmap = function(options) {
	this.set(options);

	this.lastUpdate = 0;

	this.canvas = document.createElement('canvas');

	this.heatmap = new WebGLHeatmap({
		canvas: this.canvas,
		width: this.width,
		height: this.height
	});

	// Create a texture
	var texture = this.texture = new THREE.Texture(this.canvas);

	// Pick up a few FPS with constant texture updates
	// Via https://github.com/mrdoob/three.js/issues/2233
	texture.premultiplyAlpha = true;

	// Setup mesh
	this.geometry = new THREE.SphereGeometry(this.radius, 32, 32);
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
	decayFactor: 0
};

Heatmap.prototype.set = function(options) {
	util.extend(this, this.constructor.defaults, options);

	// Invert decay factor
	this.decayFactor = this.decayFactor === 0 ? 0 : 1 - this.decayFactor;
};

Heatmap.prototype.add = function(data) {
	var pos = util.latLongTo2dCoordinate(data.location[0], data.location[1], this.width, this.height)
	if (pos.x === 0) {
		console.error('Got 0,0 location', data)
	}
	this.heatmap.addPoint(pos.x, pos.y, data.size || this.size, data.intensity || this.intensity);

	// Tell THREE to update the texture from the canvas
	// Commented out due to smooth hack
	this.texture.needsUpdate = true;

	this.heatmap.update();
	this.heatmap.display();
};

Heatmap.prototype.update = function(timeDiff, time) {
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
