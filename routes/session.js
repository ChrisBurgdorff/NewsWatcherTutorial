//session.js: Node module for session login and logout route handling

"use strict";
var express = require('express');
var bcrypt = require('bcryptjs'); //Password hash comparing
var jwt = require('jwt-simple'); //Token auth
var joi = require('joi'); //Data validation
var authHelper = require('./authHelper');
var config = require('../config');

var router = express.Router();

//Create security token that is passed back and forth when user is logged in.
//User email and password (hashed) are included in the body of the request
router.post('/', function postSession(req, res, next) {
	//Password must be 7 to 15 chars and contain number and special character
	var schema = {
		email: joi.string().email().min(7).max(50).required(),
		password: joi.string().regex(/^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{7,15}$/).required()
	};
	joi.validate(req.body, schema, function(err, value) {
		if (err)
			return next(new Error('Invalid field: password 7 to 15 characters (one number, one special character)'));
		
		req.db.collection.findOne({ type: 'USER_TYPE',
			email: req.body.email }, 
			function (err, user) {
				if (err) return next(err);
				
				if (!user) return next(new Error('User was not found.'));
				
				bcrypt.compare(req.body.password, user.passwordHash,
				function comparePassword (err, match) {
					if (match) {
						try {
							var token = jwt.encode({authorized: true,
							sessionIP: req.ip,
							sessionUA: req.headers['user-agent'],
							userId: user._id.toHexString(),
							displayName: user.displayName },
							config.JWT_SECRET);
							req.status(201).json({
							displayName: user.displayName,
							userId: user._id.toHexString(),
							token: token,
							msg: 'Authorized'
							});
						} catch (err) {return next(err);}
					} else {
						return next(new Error('Wrong Password'));
					}
				});
			});
	});
});

router.delete('/:id', authHelper.checkAuth, function(req, res, next){
	//Verify the passed in email is the same as that in the auth token
	if (req.params.id != req.auth.userId)
		return next(new Error('Invalid request for logout'));
		
	res.status(200).json({msg: 'Logged out'});
});

module.exports = router;