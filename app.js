var net = require('net'),
	mongojs = require('mongojs');
 
var sockets = []; // Store sockets
 
var db_uri = "mongodb://localhost/eazy365", // Database URL for connection
	db_collections = ["devices", "pending_commands"], // Collections to open
	db = mongojs.connect(db_uri, db_collections) // Open database connection

var command_interval = 5 * 1000 // Interval to check for pending commands

/*
 * Cleans the input of carriage return, newline
 */
function cleanInput(data) {
	return data.toString().replace(/(\r\n|\n|\r)/gm,"");
}
 
/*
 * Method executed when data is received from a socket
 */
function receiveData(socket, data) {
	var cleanData = cleanInput(data);
	if(cleanData === "BYE" || cleanData === "QUIT") {
		socket.end('SESSION TERMINATED\n');
	}
	else if(cleanData.lastIndexOf("AUTH ", 0) === 0) {
		authID = cleanData.toString().split(" ")[1];
		db.devices.findOne({authID: authID}, function(err, document) {
			//console.log(document.name);
			if (document) {
				socket.authID = authID;
				db.devices.update({"authID": socket.authID}, {$set: {"online": true}},{upsert:true,safe:false}, function(err, updated) {
				if(err) console.log("User not updated");
					else console.log("User updated");
				});
				socket.write('AUTH SUCCESS\n');
			} else {
				socket.write('AUTH FAILURE\n');
			}
		});
		
	}
	else if(cleanData.lastIndexOf("TYPE ", 0) === 0) {
		if (!socket.authID) {
			socket.write('AUTH REQUIRED\n');
		} else {
			socket.deviceType = cleanData.toString().split(" ")[1];;
			socket.write('TYPE SUCCESS\n')
		}
	}
	else if(cleanData.lastIndexOf("SET ", 0) === 0) {
		if (!socket.authID) {
			socket.write('AUTH REQUIRED\n');
		} else if (!socket.deviceType) {
			socket.write('TYPE REQUIRED\n');
		} else {
			variable = cleanData.toString().split(" ")[1].split("=")[0];

			var db_packet = { };
			db_packet[variable] = value;

			db.devices.update({"authID": socket.authID}, {$set: db_packet},{upsert:true,safe:false}, function(err, updated) {
			  if(err) console.log("User not updated");
			  else console.log("User updated");
			});
			console.log(packet);
			socket.write('SET SUCCESS\n')
		}
	}
	else {
		socket.write('INVALID COMMAND\n');
	}
}
 
/*
 * Method executed when a socket ends
 */
function closeSocket(socket) {
	db.devices.update({"authID": socket.authID}, {$set: {"online": false}},{upsert:true,safe:false}, function(err, updated) {
	  if(err) console.log("User not updated");
	  else console.log("User updated");
	});
	var i = sockets.indexOf(socket);
	if (i != -1) {
		sockets.splice(i, 1);
	}
}
 
/*
 * Callback method executed when a new TCP socket is opened.
 */
function newSocket(socket) {
	sockets.push(socket);
	socket.write('HELLO\n');

	// Set socket to timeout after 90 seconds
	socket.setTimeout(90000, function(data) {
		socket.end('Idle Disconnect');
	});

	socket.on('data', function(data) {
		receiveData(socket, data);
	})
	socket.on('end', function() {
		closeSocket(socket);
	})
}
 
// Create a new server and provide a callback for when a connection occurs
var server = net.createServer(newSocket);
 	

// Listen on port 8888
server.listen(8888);
console.log("Server started on port 8888");

// Loop function to check for pending commands
setInterval(function() {
  db.pending_commands.find({}, function(err, pending_commands) {
	  if( err || !pending_commands) { 
	  	console.log("No commands found");
	  } else {
		pending_commands.forEach( function(pending_command) { // Process each individual command
		    sockets.forEach( function(socket) { // Find the socket which holds the authID
		    	if (socket.authID == pending_command.authID) { // Success we found the socket
		    		socket.write(pending_command.command); // Send command
		    		socket.write("\n"); // Write new line for the command
		    		db.pending_commands.remove(pending_command); // Remove the command as its been processed
		    	}
		    });	
	    });
	}
  } );
}, command_interval);