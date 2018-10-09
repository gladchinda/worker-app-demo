const redis = require('redis');
const amqp = require('amqplib');
const logger = require('morgan');
const express = require('express');

const app = express();

const PORT = process.env.PORT || 3000;
app.set('port', PORT);

const Cache = redis.createClient('redis://redis');
const queueOpen = amqp.connect('amqp://rabbitmq');

const ROUTING_KEY = "words";
const EXCHANGE_NAME = "worker_app";
const QUEUE_NAME = "dictionary";

Cache.on("error", err => {
	console.log("Error " + err);
});

queueOpen
	.then(conn => conn.createChannel())
	.then(ch => {
		// Bind a queue to the exchange to listen for messages
		// When we publish a message, it will be sent to this queue, via the exchange
		return ch.assertExchange(EXCHANGE_NAME, "direct", { durable: true })
			.then(() => ch.assertQueue(QUEUE_NAME, { exclusive: false }))
			.then(q => ch.bindQueue(q.queue, EXCHANGE_NAME, ROUTING_KEY));
	})
	.catch(err => {
		console.error(err);
		process.exit(1);
	});

// Add a word to the database
function addWord(word, definition) {
	return new Promise((resolve, reject) => {
		Cache.hset("words", word, definition, (err, result) => err ? reject(err) : resolve("success"));
	});
}

// Get words from the database
function getWords() {
	return new Promise((resolve, reject) => {
		Cache.hgetall("words", (err, resp) => err ? reject(err) : resolve(resp));
	});
}

// Publish a message to the exchange
// RabbitMQ will move it to the queue
function addMessage(message) {
	return queueOpen
		.then(conn => conn.createChannel())
		.then(ch => {
			ch.publish(EXCHANGE_NAME, ROUTING_KEY, new Buffer(message));

			const msgTxt = message + " : Message sent at " + new Date();
			console.log(" [+] %s", msgTxt);

			return new Promise(resolve => resolve(message));
		});
}

// Get a message from the queue
function getMessage() {
	return queueOpen
		.then(conn => conn.createChannel())
		.then(ch => {
			return ch.get(QUEUE_NAME, {})
				.then(msgOrFalse => new Promise(resolve => {
					let result = "No messages in queue";

					if (msgOrFalse !== false) {
						result = msgOrFalse.content.toString() + " : Message received at " + new Date();
						ch.ack(msgOrFalse);
					}

					console.log(" [-] %s", result);

					resolve(result);
				}));
		});
}

app.use(logger('dev'));
app.use(express.json());

app.put('/words', (req, res) => {
	const { word, definition } = req.body;

	addWord(word, definition)
		.then(resp => res.send(resp))
		.catch(err => {
			console.log(err);
			res.status(500).send(err);
		});
})

app.get('/words', (req, res) => {
	getWords()
		.then(words => res.send(words))
		.catch(err => {
			console.log(err);
			res.status(500).send(err);
		});
})

// The user has clicked submit to add a word and definition to the database
// Send the data to the addWord function and send a response if successful
app.put('/message', function (req, res) {
	addMessage(req.body.message)
		.then(resp => res.send(resp))
		.catch(err => {
			console.log('error:', err);
			res.status(500).send(err);
		});
})

// Read from the database when the page is loaded or after a word is successfully added
// Use the getWords function to get a list of words and definitions from the database
app.get('/message', function (req, res) {
	getMessage()
		.then(words => res.send(words))
		.catch(err => {
			console.log(err);
			res.status(500).send(err);
		});
});

app.listen(PORT, () => console.log(`> App is running on port ${PORT}.`));
