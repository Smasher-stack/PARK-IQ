// ─── Swagger Configuration ──────────────────────────────────────────────────
// OpenAPI 3.0 specification for ParkIQ API documentation.

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ParkIQ API',
      version: '1.0.0',
      description: 'ParkIQ Smart Parking Platform — REST API Documentation',
      contact: {
        name: 'ParkIQ Team'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development Server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        ParkingSlot: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Chromepet Railway Parking' },
            lat: { type: 'number', format: 'double', example: 12.9516 },
            lng: { type: 'number', format: 'double', example: 80.1462 },
            type: { type: 'string', enum: ['public', 'residential'], example: 'public' },
            availableSlots: { type: 'integer', example: 12 },
            totalSlots: { type: 'integer', example: 30 },
            price: { type: 'number', example: 20 },
            status: { type: 'string', enum: ['available', 'limited', 'booked'], example: 'available' },
            score: { type: 'number', example: 2.45 },
            etaText: { type: 'string', example: '5 min' },
            isBestMatch: { type: 'boolean', example: true }
          }
        },
        RouteRequest: {
          type: 'object',
          required: ['start', 'end'],
          properties: {
            start: {
              type: 'object',
              properties: {
                lat: { type: 'number', example: 12.9249 },
                lng: { type: 'number', example: 80.1100 }
              }
            },
            end: {
              type: 'object',
              properties: {
                lat: { type: 'number', example: 12.9516 },
                lng: { type: 'number', example: 80.1462 }
              }
            }
          }
        },
        RouteResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            distance: { type: 'number', example: 4.7, description: 'Distance in km' },
            duration: { type: 'number', example: 8, description: 'Duration in minutes' },
            geometry: { type: 'object', description: 'GeoJSON geometry object' }
          }
        },
        BookingRequest: {
          type: 'object',
          required: ['slotId'],
          properties: {
            slotId: { type: 'integer', example: 1 },
            duration: { type: 'integer', example: 2, description: 'Hours' },
            vehicleNumber: { type: 'string', example: 'TN 07 AB 1234' }
          }
        },
        AuthRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@parkiq.com' },
            password: { type: 'string', example: 'securepassword123' },
            name: { type: 'string', example: 'John Doe' }
          }
        }
      }
    }
  },
  apis: ['./routes/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
