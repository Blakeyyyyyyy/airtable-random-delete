import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = process.env.TABLE_NAME || 'responses';

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Version endpoint
app.get('/version', (req, res) => {
  res.json({ 
    version: '1.0.0',
    service: 'airtable-random-delete'
  });
});

interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
  createdTime: string;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

// Main endpoint to delete a random record
app.post('/delete-random', async (req, res) => {
  try {
    // Validate environment variables
    if (!AIRTABLE_TOKEN) {
      return res.status(500).json({ error: 'AIRTABLE_TOKEN environment variable is required' });
    }
    
    if (!AIRTABLE_BASE_ID) {
      return res.status(500).json({ error: 'AIRTABLE_BASE_ID environment variable is required' });
    }

    console.log(`Fetching records from table: ${TABLE_NAME}`);
    
    // Fetch all records from the table
    const response = await axios.get<AirtableResponse>(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        },
      }
    );

    const records = response.data.records;
    
    if (records.length === 0) {
      return res.status(404).json({ 
        error: 'No records found in the table',
        table: TABLE_NAME
      });
    }

    // Select a random record
    const randomIndex = Math.floor(Math.random() * records.length);
    const recordToDelete = records[randomIndex];
    
    console.log(`Deleting record: ${recordToDelete.id}`);

    // Delete the selected record
    await axios.delete(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${recordToDelete.id}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        },
      }
    );

    console.log(`Successfully deleted record: ${recordToDelete.id}`);

    // Return success response with deleted record info
    res.status(200).json({
      success: true,
      message: 'Random record deleted successfully',
      deletedRecord: {
        id: recordToDelete.id,
        createdTime: recordToDelete.createdTime,
        fields: recordToDelete.fields
      },
      totalRecordsBeforeDeletion: records.length,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error deleting random record:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        error: 'Authentication failed. Check your Airtable Personal Access Token.',
        details: 'Ensure your token has data.records:read and data.records:write permissions'
      });
    }
    
    if (error.response?.status === 403) {
      return res.status(403).json({ 
        error: 'Access denied. Check your token permissions and base access.',
        details: 'Ensure your token has access to this specific base and the required scopes'
      });
    }
    
    if (error.response?.status === 404) {
      return res.status(404).json({ 
        error: 'Table not found',
        table: TABLE_NAME,
        details: 'Check that the table name is correct and exists in your base'
      });
    }

    res.status(500).json({
      error: 'Failed to delete random record',
      details: error.response?.data || error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET endpoint for testing (lists records without deleting)
app.get('/records', async (req, res) => {
  try {
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      return res.status(500).json({ error: 'Missing required environment variables' });
    }

    const response = await axios.get<AirtableResponse>(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}?maxRecords=5`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        },
      }
    );

    res.json({
      totalRecords: response.data.records.length,
      records: response.data.records.map(record => ({
        id: record.id,
        createdTime: record.createdTime,
        fields: record.fields
      })),
      table: TABLE_NAME
    });

  } catch (error: any) {
    console.error('Error fetching records:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch records',
      details: error.response?.data || error.message
    });
  }
});

// Graceful shutdown handling
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Airtable Random Delete service running on port ${PORT}`);
  console.log(`📋 Table: ${TABLE_NAME}`);
  console.log(`💾 Base ID: ${AIRTABLE_BASE_ID ? 'Set' : 'Missing'}`);
  console.log(`🔑 Token: ${AIRTABLE_TOKEN ? 'Set' : 'Missing'}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});