const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId, } = require('mongodb');
const app = express()
const jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.PAYMENT_TOKEN_SECRET);
const port = process.env.PORT || 5002;



app.use(express.static("public"));

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.epdvwuc.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const menuCollections = client.db('bistroDb').collection('menu');
    const reviewsCollections = client.db('bistroDb').collection('reviews');
    const cartsCollections = client.db('bistroDb').collection('carts');
    const userCollections = client.db('bistroDb').collection('user');
    const paymentsCollections = client.db('bistroDb').collection('payments');


    const verifytoken = (req, res, next) => {
      console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      console.log(token)
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }



    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '30d' })
      res.send({ token })
    })

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await userCollections.findOne(query);
      const isAdmin = user?.role === 'admin'
      if (!isAdmin) {
        return res.status(403).send({ error: true, message: 'forbidden access' });
      }
      next();
    }


    app.get('/user', verifytoken, verifyAdmin, async (req, res) => {
      const result = await userCollections.find().toArray();
      res.send(result)
    })

    app.get('/user/admin/:email', verifytoken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email }
      const user = await userCollections.findOne(query);
      let admin = false
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })


    app.patch('/user/admin/:id', verifytoken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollections.updateOne(filter, updatedDoc);
      res.send(result);

    })



    app.get('/admin-stats', verifytoken, verifyAdmin, async (req, res) => {
      const users = await userCollections.estimatedDocumentCount();
      const menuItems = await menuCollections.estimatedDocumentCount();
      const orders = await paymentsCollections.estimatedDocumentCount();
      const result = await paymentsCollections.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray()
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;
      res.send({
        users,
        menuItems,
        orders,
        revenue
      })
    })

    app.patch('/menu/:id', verifytoken, verifyAdmin, async (req, res) => {
      const item = req.body
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          recipe: item.recipe,
          image: item.image

        }
      }
      const result = await menuCollections.updateOne(filter, updatedDoc);
      res.send(result)
    })


    app.post('/user', async (req, res) => {
      const user = req.body;
      const quary = { email: user.email }
      const existingUser = await userCollections.findOne(quary)
      if (existingUser) {
        return res.send({ massage: 'user alredy exists', insertedId: null })
      }
      const result = await userCollections.insertOne(user)
      res.send(result)
    })

    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) }
      const result = await menuCollections.findOne(quary);
      res.send(result)
    })


    app.delete('/user/:id', verifytoken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) }
      const result = await userCollections.deleteOne(quary);
      res.send(result)
    })

    app.post('/menu', verifytoken, verifyAdmin, async (req, res) => {
      const cartsItem = req.body;
      const result = await menuCollections.insertOne(cartsItem)
      res.send(result)
    })


    app.get('/menu', async (req, res) => {
      const cursor = menuCollections.find();
      const result = await cursor.toArray();
      res.send(result)
    })

    app.delete('/menu/:id', verifytoken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) }
      const result = await menuCollections.deleteOne(quary);
      res.send(result)
    })


    app.get('/reviews', async (req, res) => {
      const cursor = reviewsCollections.find();
      const result = await cursor.toArray();
      res.send(result)
    })



    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const quary = { email: email };
      const result = await cartsCollections.find(quary).toArray();

      res.send(result)
    })



    app.post('/carts', async (req, res) => {
      const cartsItem = req.body;
      const result = await cartsCollections.insertOne(cartsItem)
      res.send(result)
    })



    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) }
      const result = await cartsCollections.deleteOne(quary);
      res.send(result)
    })

    app.get('/payments/:email', verifytoken, async (req, res) => {
      const quary = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const result = await paymentsCollections.find(quary).toArray();

      res.send(result)
    })


    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card'],

      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });


    app.post('/payments', async (req, res) => {
      const payment = req.body;
      payment.menuItemId= payment.menuItemId.map((id) => new ObjectId(id));
      const paymentResult = await paymentsCollections.insertOne(payment);
      console.log('payment;;;;;;;;;;;;;;;;', payment)
      const quary = {
        _id: {
          $in: payment.cartId.map((id) => new ObjectId(id))
        }
      }

      const delededResult = await cartsCollections.deleteMany(quary)

      res.send({ paymentResult, delededResult });

    })

    // app.get('/order-stats', async (req, res) => {
    //   const result = await paymentsCollections.aggregate([
    //     {
    //       $unwind: '$menuItemId',
    //     },
    //     {
    //       $lookup: {
    //         from: 'menu',
    //         localField: '$menuItemId',
    //         foreignField: '_id',
    //         as: 'menuItems'
    //       }
    //     },
    //     {
    //       $unwind: '$menuItems',
    //     },
    //     {
    //       $group: {
    //         _id: 'menuItems.category',
    //         quantity: {$sum: 1},
    //         revenue: {$sum: '$menuItems.price'},
    //       }
    //     }
    //   ]).toArray()
    //   res.send(result)
    // })



    app.get('/order-stats', verifytoken,verifyAdmin, async(req, res) =>{
      const pipeline = [
        {
          $unwind: '$menuItemId'
        },
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItemId',
            foreignField: '_id',
            as: 'menuItems'
          }
        },
        {
          $unwind: '$menuItems'
        },
        {
          $group: {

            _id: '$menuItems.category',
            quantity: { $sum: 1 },
            revenue: { $sum: '$menuItems.price' }
          }
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            quantity: '$quantity',
            revenue: '$revenue'
           
          }
        }
      ];

      const result = await paymentsCollections.aggregate(pipeline).toArray()
      res.send(result)

    })


   
  


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error

  }
}
run().catch(console.dir);



// nodemon index.js

app.get('/', (req, res) => {
  res.send('Bitro boss is running')
})
app.listen(port, () => {
  console.log(`Bitro boss server is running on port ${port}`)
})


