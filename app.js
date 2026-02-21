const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv/config');

app.use(cors());
//app.options('*', cors());

app.use(bodyParser.json());

//routes
const eventRoutes = require('./routes/event');
const productRoutes = require('./routes/products');
const courseRoutes = require('./routes/course');
const serviceRoutes = require('./routes/service');
const userRoutes = require('./routes/user');
const clientRoutes = require('./routes/client');
const requestRoutes = require('./routes/request');
const cartRoutes = require('./routes/cart');
const productReviewRoutes = require('./routes/productReview');
const imageRoutes = require('./routes/imageUpload');

// deployment
const health = require("./routes/health");

app.use('/uploads', express.static('uploads')); 
app.use(`/api/event`, eventRoutes);
app.use(`/api/product`, productRoutes);
app.use(`/api/course`, courseRoutes);
app.use(`/api/service`, serviceRoutes);
app.use(`/api/user`, userRoutes);
app.use(`/api/client`, clientRoutes);
app.use(`/api/request`, requestRoutes);
app.use(`/api/cart`, cartRoutes);
app.use(`/api/productReview`, productReviewRoutes);
app.use(`/api/imageUpload`, imageRoutes);
app.use("/health", health);



// Environment validation
if (!process.env.CONNECTION_STRING || !process.env.PORT) {
    console.error('CRITICAL: Missing required environment variables');
    process.exit(1);
}

// security
const connectionOptions = {
    // Your current reliability options
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    
    // Use ONLY ONE of these SSL options:
    ssl: true,
    tlsAllowInvalidCertificates: false, // Choose this for security
    
    // Authentication
    authSource: 'admin',
    
    // Data consistency
    retryWrites: true,
    w: 'majority',                // Ensure read operations complete
};

//Database
mongoose.connect(process.env.CONNECTION_STRING, connectionOptions)
.then(() => {
    console.log('Database connection is ready...')

    //server
    app.listen(process.env.PORT, () => {
    console.log(`server is running http://localhost:${process.env.PORT}`);
}) 
})
.catch((err) => {
    console.log(err);
    process.exit(1); // Exit process on connection failure
})


// Event listeners for connection issues
/*mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected - attempting reconnect...');
});*/