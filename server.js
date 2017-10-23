//Modules
var express = require('express'); //Route handlers
var path = require('path'); //Populating the path property of request
var logger = require('morgan'); //HTTP request logging
var bodyParser = require('body-parser'); //Access to the HTTP request body
var cp = require('child_process'); //Forking separate Node.js processes
var responseTime = require('response-time'); //Performance logging
var helmet = require('helmet'); //HTTP header hack mitigation
var rateLimit = require('express-rate-limit'); //IP base rate limiter

//Custom modules
var config = require('./config');
var users = require('./routes/users');
var session = require('./routes/session');
var sharedNews = require('./routes/sharedNews');

var app = express();
app.enable('trust proxy');

//Set up rate limiting
var limiter = new RateLimit({
	windowMs: 15*60*1000, //15 minutes
	max: 100, //limit each IP to 100 request per windowMs
	delayMs: 0 //Disable delaying - full speed until the max limit is reached
});

//apply the request limiting to all requests
app.use(limiter);

//Set up the helmet module to mitigate certain security hacks
//Take the defaults to start with and then add in CSP
app.use(helmet());
app.use(helmet.csp({
	//Specify directives for content sources
	directives: {
		defaultSrc: ["'self'"],
		scriptSrc: ["'self'", "'unsafe-inline'", 'ajax.googleapis.com', 'maxcdn.bootstrapcdn.com'],
		styleSrc: ["'self'", "'unsafe-inline'", 'maxcdn.bootstrapcdn.com'],
		fontSrc: ["'self'", 'maxcdn.bootstrapcdn.com'],
		imgSrc: ['*']
		//reportUri: '/report-violation'
	}
}));

//Add an X-Response-Time header to responses to measure response times
app.use(responseTime());

//Log all Http requests, the "dev" option gives it a specific styling
app.use(logger('dev'));

//Set up the response object in routes to contain a body property with
// an object of what is parsed from the JSON body request payload
//There is no need for allowing a huge body, since it might be an attack, so using limit option
app.use(bodyParser.json({limit: '100kb'}));

//This middleware takes any query string key/value pairs and sticks them in body
app.use(bodyParser.urlencoded({ extended: false }));

//Simplify serving of static content
app.use(express.static(path.join(__dirname, 'static')));

//Fork a process for more intensive computation that we don't want in main Node thread
var node2 = cp.fork('./app_FORK.js');
//var node2 = cp.fork('./app_FORK.js', [], { execArgv: ['--debug=5859'] });

node2.on('exit', function(code) {
	node2 = undefined;
	node2 = cp.fork('./worker/app_FORK.js', [], { execArgv: ['--debug=5859'] } );
});

//Mongo connection
var assert = require('assert');
var db = {};
var MongoClient = require('mongodb').MongoClient;

//Use the connect method to connect to the server
MongoClient.connect(config.MONGODB_CONNECT_URL, function(err, dbConn) {
	assert.equal(null, err);
	db.dbConnection = dbConn;
	db.collection = dbConn.collection('newswatcher');
	console.log("Connected to a MongoDB server.");
});

//Middleware for all routes to inject db info as properties
app.use(function(req, res, next) {
	req.db = db;
	req.node2 = node2;
	next();
});

//Express route handling
app.get('/', function(req, res){
	res.render('index.html');
});

//Rest API Routes
app.use('/api/users', users);
app.use('/api/sessions', session);
app.use('/api/sharednews', sharedNews);

//404 error handler
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

//Developement error handling
if (app.get('env') === 'development') {
	app.use(function(err, req, res, next) {
		res.status(err.status||500).json({message:err.toString(), error: err});
		console.log(err);
	});
}

//Production error handling
app.use(function(err, req, res, next) {
	res.status(err.status || 500).json({message:err.toString(), error: {}});
	console.log(err);
});

//Listen for correct port
app.set('port', process.env.PORT || 3000);
var server = app.listen(app.get('port'), function() {
	console.log("Express server listening on port " + server.address().port);
});