const logger = require('morgan');
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
app.set('port', PORT);

app.use(logger('dev'));

app.listen(PORT, () => console.log(`> App is running on port ${PORT}.`));
