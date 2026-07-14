import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

// .env ফাইল লোড করা
dotenv.config();

const app = express();
const port = process.env.PORT || 6060;

// 🛠️ access all domain;
app.use(cors());
app.use(express.json()); // for recive json data;




const uri = process.env.MONGODB_URI as string

// MongoClient তৈরি করা (TypeScript এ ServerApiVersion এবং অন্যান্য অপশন অটো-ডিটেক্ট হয়)
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // MongoDB সার্ভারের সাথে কানেক্ট করা
        await client.connect();
        console.log("📌 Successfully connected to MongoDB!");

        const db = client.db(process.env.DB_NAME);
        const recipeCollection = db.collection("recipes");


        // user add recipe;
        app.post('/api/add-recipe', async (req: Request, res: Response) => {
            try {
                const recipeData = req.body;
                const newData = {
                    ...recipeData,
                    createdAt: new Date()
                }

                // ডাটাবেজে ডেটা ইনসার্ট করা
                const result = await recipeCollection.insertOne(newData);

                res.status(201).json({
                    success: true,
                    message: "Recipe added to database successfully!",
                    insertedId: result.insertedId
                });
            } catch (error) {
                console.error("Database Insert Error:", error);
                res.status(500).json({ success: false, message: "Failed to save recipe." });
            }
        });

        // user, get my-recipes by user id;
        app.get('/api/my-recipes/:creatorId', async (req: Request, res: Response) => {
            const { creatorId } = req.params as { creatorId: string };
            const result = await recipeCollection
                .find({ creatorId })
                .sort({ createdAt: -1 })
                .toArray();
            res.send(result)

        })

        // user delete recipe;
        app.delete('/api/delete-recipe/:recipeId', async (req: Request, res: Response) => {
            const { recipeId } = req.params as { recipeId: string };
            const query = {
                _id: new ObjectId(recipeId)
            }
            await recipeCollection.deleteOne(query);
            res.send({ success: true, message: 'recipe delete successful!' })
        })

        //     // 🔍 সব রেpositions গেট করার ডেমো API রুট
        //     app.get('/api/recipes', async (req: Request, res: Response) => {
        //       try {
        //         const recipes = await recipeCollection.find().toArray();
        //         res.status(200).json({ success: true, data: recipes });
        //       } catch (error) {
        //         res.status(500).json({ success: false, message: "Failed to fetch recipes." });
        //       }
        //     });

    }

    catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}

// ডাটাবেজ ফাংশনটি রান করানো
run().catch(console.dir);



// 🔍 গ্লোবাল এরর হ্যান্ডলার
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).send({ success: false, message: "Something broke on the server!" });
});

// সার্ভার লিসেন করা
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});