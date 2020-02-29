import App from './gt.App.js';

const gt = {
	config: {
		earthRadius: 200,
		markerRadius: 200,
		cloudRadius: 205,
		cloudSpeed: 0.000003,
		cameraDistance: 500,

		debug: false,
		pauseOnBlur: false,

		itemName: 'case',
		itemNamePlural: 'cases'
	},
	init: function() {
		gt.app = new App(gt.config);
	}
};

window.addEventListener('load', gt.init);
