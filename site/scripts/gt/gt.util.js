import * as THREE from 'three';

const util = {
	// Convert a latitude/longitude pair to a 3D point
	latLongToVector3: function(lat, lon, radius) {
		var phi = (lon+90)*Math.PI/180; // Lon
		var theta = lat*Math.PI/180; // Lat

		var z = radius * Math.cos(phi) * Math.cos(theta); // Lon
		var x = radius * Math.sin(phi) * Math.cos(theta); // Lat
		var y = radius * Math.sin(theta);

		return new THREE.Vector3(x,y,z);
	},

	// Convert a latitude/longitude pair to a X/Y coordiante pair
	// Via http://stackoverflow.com/a/14457180/1170723
	latLongTo2dCoordinate: function(latitude, longitude, mapWidth, mapHeight) {
		var pos = {};

		// Get X value
		pos.x = (mapWidth*(longitude)/360)%mapWidth+(mapWidth/2);
		// pos.x = (longitude+180)*(mapWidth/360);
		
		// Convert from degrees to radians
		var latRad = util.deg2rad(latitude);

		var mercN = Math.log(Math.tan((Math.PI/4)+(latRad/2)));

		// Adjust the coordinate position for the projection, sort of
		mercN *= Math.cos(latRad/Math.PI*1.92);

		// Get Y value
		pos.y = (mapHeight/2)-(mapWidth*mercN/(2*Math.PI));

		if (isNaN(pos.y) || isNaN(pos.x)) {
			throw new Error('Failed to calculate position for '+latitude+','+longitude);
		}

		return pos;
	},

	rad2deg: function(rad) {
		return rad * 180 / Math.PI;
	},

	deg2rad: function(deg) {
		return deg * Math.PI / 180;
	},

	// Get the fractional day of the year for a given date
	// Use the current date if no date provided
	getDOY: function(date) {
		date = date || new Date();
		return date.getTime()/1000/60/60/24 % 365;
	},

	getHashArgs: function() {
		var args = {};
		var argString = window.location.hash.replace(/^#/, '');
		var argPairs = argString.split('&');
		argPairs.forEach(function(argPair) {
			var argParts = argPair.split('=');
			args[argParts[0]] = argParts[1];
		});

		return args;
	},

	setHashFromArgs: function(args) {
		var hash = '#';
		var count = 0;
		for (var arg in args) {
			var value = args[arg];
			if (!value) {
				continue;
			}

			if (count > 0) {
				hash += '&';
			}

			hash += `${arg}=${value}`;

			count++;
		}

		history.replaceState(null, null, hash);
	},

	extend: function() {
		var objs = arguments;
		var result = objs[0];
		for (var i = 1; i < objs.length; i++) {
			var obj = objs[i];
			for (var prop in obj) {
				if (obj.hasOwnProperty(prop))
					result[prop] = obj[prop];
			}
		}
		return result;
	},

	round: function(number, factor) {
		return Math.round(number * factor) / factor;
	},

	formatDateForDataset: function(dateString) {
		let date = new Date(dateString + 'T12:00:00');
		return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear() - 2000}`;
	},

	formatDateForInput: function(dateString) {
		return new Date(dateString).toISOString().split("T")[0];
	}
};

export default util;
