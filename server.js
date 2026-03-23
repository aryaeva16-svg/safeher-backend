require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { db } = require('./firebase')
const twilio = require('twilio')

const app = express()
app.use(cors({
  origin: 'http://localhost:5173'  // ← only your React app
}))
app.use(express.json())

const PORT = process.env.PORT || 5000

// Twilio client setup
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

// Test route
app.get('/', (req, res) => {
  res.json({ message: '🛡️ SafeHer backend is running!' })
})

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is healthy',
    timestamp: new Date().toLocaleTimeString()
  })
})

// GET all contacts
app.get('/contacts', async (req, res) => {
  try {
    const snapshot = await db.collection('emergencyContacts').get()
    const contacts = []
    snapshot.forEach((doc) => {
      contacts.push({ id: doc.id, ...doc.data() })
    })
    res.json({ success: true, contacts })
  } catch(error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST add a contact
app.post('/contacts', async (req, res) => {
  try {
    const { name, phone } = req.body
    if(!name || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name and phone are required'
      })
    }
    const docRef = await db.collection('emergencyContacts').add({
      name,
      phone,
      createdAt: new Date().toISOString()
    })
    res.json({
      success: true,
      message: 'Contact added successfully',
      id: docRef.id
    })
  } catch(error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// DELETE a contact
app.delete('/contacts/:id', async (req, res) => {
  try {
    const { id } = req.params
    await db.collection('emergencyContacts').doc(id).delete()
    res.json({ success: true, message: 'Contact deleted successfully' })
  } catch(error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// SOS route with real Twilio SMS
app.post('/send-sos', async (req, res) => {
  try {
    const { lat, lng, userName } = req.body

    if(!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Location coordinates are required'
      })
    }

    const mapLink = `https://www.google.com/maps?q=${lat},${lng}`

    const message = `🚨 SOS! ${userName || 'Someone'} needs help! Location: ${mapLink}`

    const snapshot = await db.collection('emergencyContacts').get()
    const contacts = []
    snapshot.forEach((doc) => {
      contacts.push(doc.data())
    })

    if(contacts.length === 0) {
      return res.json({
        success: false,
        message: 'No emergency contacts found. Please add contacts first.'
      })
    }

    const smsPromises = contacts.map((contact) => {
      return twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: contact.phone
      })
    })

    const results = await Promise.all(smsPromises)

    console.log('🚨 SOS sent!')
    console.log('From:', userName)
    console.log('Location:', mapLink)
    console.log('SMS sent to:', contacts.length, 'contacts')

    res.json({
      success: true,
      message: `🚨 SOS alert sent to ${contacts.length} contacts!`,
      location: mapLink,
      contactsNotified: contacts.length,
      messagesSent: results.length
    })

  } catch(error) {
    console.error('SOS error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

app.listen(PORT, () => {
  console.log(`🚀 SafeHer backend running on http://localhost:${PORT}`)
})