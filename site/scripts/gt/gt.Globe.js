import util from './gt.util.js';
import * as THREE from 'three';

const Globe = function(options) {
	// Store options
	util.extend(this, Globe.defaults, options);

	this.handleLoad = this.handleLoad.bind(this, 3);

	var loader = new THREE.TextureLoader();

	// Setup globe mesh
	var globeGeometry = new THREE.SphereGeometry(this.radius, 64, 64);
	var globeMaterial = new THREE.MeshPhongMaterial({
		shininess: 20
	});
	// Main texture
	globeMaterial.map = loader.load(require('url:../../textures/globe/earthmap4k.jpg'), this.handleLoad);
	// globeMaterial.map = loader.load(require('url:../../textures/globe/earthgrid.png'), this.handleLoad); // Lat/Long grid

	// Bump map (disabled to work around broken optimized bundle)
	globeMaterial.bumpMap = loader.load(require('url:../../textures/globe/earthbump4k.jpg'), this.handleLoad);
	globeMaterial.bumpScale = 2;

	this.globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
	this.globeMesh.name = 'Globe';

	// Since the earth is static, disable auto-updating of its matrix
	this.globeMesh.matrixAutoUpdate = false;
	this.globeMesh.updateMatrix();

	// Setup cloud mesh
	var cloudGeometry = new THREE.SphereGeometry(this.cloudRadius, 48, 48);
	var cloudMaterial = new THREE.MeshPhongMaterial({
		map: loader.load(require('url:../../textures/globe/earthclouds4k.png'), this.handleLoad),
		opacity: 0.8,
		transparent: true,
		depthWrite: false
	});
	this.cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
	this.cloudMesh.name = 'Clouds';

	// Initialize root object
	this.root = new THREE.Object3D();

	// Add objects to root object
	this.root.add(this.globeMesh);
	this.root.add(this.cloudMesh);

	// Add root to scene
	this.scene.add(this.root);
};

Globe.defaults = {
	radius: 200,
	cloudRadius: 205,
	cloudSpeed: 0.000005
};

Globe.prototype.handleLoad = function(toLoad) {
	this.texturesLoaded ? this.texturesLoaded++ : (this.texturesLoaded = 1);
	if (this.texturesLoaded === toLoad)
		this.loaded();
};

Globe.prototype.update = function(time) {
	// Gently rotate the clouds around the earth as a function of time passed
	this.cloudMesh.rotation.set(0, this.cloudMesh.rotation.y + time * this.cloudSpeed, 0);
};

export default Globe;
