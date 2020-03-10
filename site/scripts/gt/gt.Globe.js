import util from './gt.util.js';
import * as THREE from 'three';
import createAtmosphereMaterial from './lib/threex.atmospherematerial.js';

const Globe = function(options) {
	// Store options
	util.extend(this, Globe.defaults, options);

	// Initialize root object
	this.root = new THREE.Object3D();

	var loader = this.loader = new THREE.TextureLoader();
	this.handleLoad = this.handleLoad.bind(this, 3);

	// Setup globe mesh
	var globeGeometry = new THREE.SphereGeometry(this.radius, 64, 64);
	var globeMaterial = this.globeMaterial = new THREE.MeshPhongMaterial({
		color: 'rgb(120, 120, 120)',
		shininess: 20
	});

	this.textures = {
		realistic: require('url:../../textures/globe/earthmap4k.jpg'),
		topo: require('url:../../textures/globe/earthspec4k.jpg')
	};

	this.setTexture(options.texture || 'realistic');

	// Main texture
	// globeMaterial.map = loader.load(require('url:../../textures/globe/earthlights4k.jpg'), this.handleLoad);
	// globeMaterial.map = loader.load(require('url:../../textures/globe/earthgrid.png'), this.handleLoad); // Lat/Long grid

	// Bump map (disabled to work around broken optimized bundle)
	globeMaterial.bumpMap = loader.load(require('url:../../textures/globe/earthbump4k.jpg'), this.handleLoad);
	globeMaterial.bumpScale = 1;

	this.globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
	this.globeMesh.name = 'Globe';

	// Since the earth is static, disable auto-updating of its matrix
	this.globeMesh.matrixAutoUpdate = false;
	this.globeMesh.updateMatrix();
	this.root.add(this.globeMesh);

	// Setup cloud mesh
	var cloudGeometry = new THREE.SphereGeometry(this.cloudRadius, 48, 48);
	var cloudMaterial = new THREE.MeshPhongMaterial({
		map: loader.load(require('url:../../textures/globe/earthclouds4k.png'), this.handleLoad),
		opacity: 0.1,
		transparent: true,
		depthWrite: false
	});
	this.cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
	this.cloudMesh.name = 'Clouds';
	this.root.add(this.cloudMesh);

	var atompsphereGeometry = globeGeometry.clone();
	var atmosphereMaterial = createAtmosphereMaterial();
	atmosphereMaterial.side = THREE.BackSide;
	atmosphereMaterial.uniforms.coeficient.value = 0.5;
	atmosphereMaterial.uniforms.power.value = 12;
	atmosphereMaterial.uniforms.glowColor.value = new THREE.Color(0, 0.9, 1);
	var atomsphereMesh = new THREE.Mesh(atompsphereGeometry, atmosphereMaterial);
	atomsphereMesh.scale.multiplyScalar(1.1);
	this.root.add(atomsphereMesh);
	this.atmosphereMaterial = atmosphereMaterial;

	// Add objects to root object
	this.directionalLight =  new THREE.DirectionalLight(0xFFFFFF, 0.75);
	this.root.add(this.directionalLight);

	this.setSunPosition();

	// Add root to scene
	// this.scene.add(this.root);
};

Globe.defaults = {
	radius: 200,
	cloudRadius: 200.5,
	cloudSpeed: 0.000005
};

Globe.prototype.setTexture = function(texture) {
	if (this.textures[texture]) {
		this.texture = texture;
		this.globeMaterial.map = this.loader.load(this.textures[texture], this.handleLoad);
	}
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

Globe.prototype.setSunPosition = function(dayOfYear, utcHour) {
	var d = new Date();
	if (typeof dayOfYear === 'undefined') {
		dayOfYear = util.getDOY(d);
	}
	if (typeof utcHour === 'undefined') {
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


export default Globe;
