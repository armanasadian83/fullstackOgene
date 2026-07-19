// routes/sitemap.js
const express = require('express');
const router = express.Router();
const { Course } = require('./../models/course');
const { Product } = require('./../models/products');

// Static routes (public pages that don't change)
const staticRoutes = [
  { url: '/', priority: 1.0, changefreq: 'daily' },
  { url: '/service', priority: 0.9, changefreq: 'weekly' },
  { url: '/aboutUs', priority: 0.8, changefreq: 'monthly' },
  { url: '/degree', priority: 0.8, changefreq: 'weekly' },
  { url: '/courseShop', priority: 0.9, changefreq: 'daily' },
  { url: '/shop', priority: 0.9, changefreq: 'daily' },
  { url: '/blog', priority: 0.9, changefreq: 'weekly' },
  // Field routes
  { url: '/field/I', priority: 0.7, changefreq: 'monthly' },
  { url: '/field/II', priority: 0.7, changefreq: 'monthly' },
  { url: '/field/III', priority: 0.7, changefreq: 'monthly' },
  { url: '/field/IV', priority: 0.7, changefreq: 'monthly' },
  { url: '/field/V', priority: 0.7, changefreq: 'monthly' },
  { url: '/field/VI', priority: 0.7, changefreq: 'monthly' },
];

// Function to generate sitemap XML
function generateSitemapXML(dynamicRoutes) {
  const baseUrl = 'https://ogenetech.com';
  const today = new Date().toISOString().split('T')[0];
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  // Add static routes
  staticRoutes.forEach(route => {
    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}${route.url}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>${route.changefreq}</changefreq>\n`;
    xml += `    <priority>${route.priority}</priority>\n`;
    xml += '  </url>\n';
  });
  
  // Add dynamic routes (courses, products)
  if (dynamicRoutes && dynamicRoutes.length > 0) {
    dynamicRoutes.forEach(route => {
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}${route.url}</loc>\n`;
      xml += `    <lastmod>${route.lastmod || today}</lastmod>\n`;
      xml += `    <changefreq>${route.changefreq || 'weekly'}</changefreq>\n`;
      xml += `    <priority>${route.priority || 0.8}</priority>\n`;
      xml += '  </url>\n';
    });
  }
  
  xml += '</urlset>';
  return xml;
}

// Main sitemap endpoint
router.get('/sitemap.xml', async (req, res) => {
  try {
    console.log('Generating sitemap...');
    
    const dynamicRoutes = [];
    
    // 1. Fetch all courses for /course/:id
    // Based on your course.js, courses don't have a status field
    // So we fetch all courses
    const courses = await Course.find({}, '_id dateEdited').lean();
    
    courses.forEach(course => {
      // Use dateEdited if available, otherwise use current date
      let lastmod = null;
      if (course.dateEdited) {
        // Parse Persian date to ISO
        try {
          // Your dateEdited is in Persian format (e.g., "1402/12/15 14:30")
          // We'll use it as is, or fallback to current date
          lastmod = new Date().toISOString().split('T')[0];
        } catch (e) {
          lastmod = new Date().toISOString().split('T')[0];
        }
      } else {
        lastmod = new Date().toISOString().split('T')[0];
      }
      
      dynamicRoutes.push({
        url: `/course/${course._id}`,
        lastmod: lastmod,
        changefreq: 'weekly',
        priority: 0.9
      });
    });
    
    console.log(`Found ${courses.length} courses`);
    
    // 2. Fetch all products for /product/:id
    // Based on your products.js, products don't have a status field
    // So we fetch all products
    const products = await Product.find({}, '_id dateEdited').lean();
    
    products.forEach(product => {
      let lastmod = null;
      if (product.dateEdited) {
        try {
          lastmod = new Date().toISOString().split('T')[0];
        } catch (e) {
          lastmod = new Date().toISOString().split('T')[0];
        }
      } else {
        lastmod = new Date().toISOString().split('T')[0];
      }
      
      dynamicRoutes.push({
        url: `/product/${product._id}`,
        lastmod: lastmod,
        changefreq: 'weekly',
        priority: 0.9
      });
    });
    
    console.log(`Found ${products.length} products`);
    
    // Generate sitemap
    const sitemap = generateSitemapXML(dynamicRoutes);
    
    // Send response
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
    
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
});

module.exports = router;