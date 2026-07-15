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


                const result = await recipeCollection.insertOne(newData);

                res.status(201).json({
                    success: true,
                    message: "Recipe added to database successfully!",

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
        });

        // latest recipe, not secured;
        app.get('/api/latest-recipes', async (req: Request, res: Response) => {
            const result = await recipeCollection.find().sort({ createdAt: -1 }).limit(4).toArray();
            res.send(result)
        });

        
        // top contributors not secured;
        app.get('/api/recipes/top-contributors', async (req: Request, res: Response) => {
            const pipeline = [
                {
                    $group:
                    {
                        _id: "$creatorId",
                        creatorName: { $first: "$creatorName" },
                        creatorEmail: { $first: "$creatorEmail" },
                        creatorImage: { $first: "$creatorImage" },
                        contribute: { $sum: 1 }
                    },
                },
                { $sort: { contribute: -1 } },
                {
                    $project: {
                        creatorId: "$_id",
                        creatorName: 1,
                        creatorEmail: 1,
                        creatorImage: 1,
                        contribute: 1,
                        _id: 0

                    }
                },
                { $limit: 4 }
            ]
            const result = await recipeCollection.aggregate(pipeline).toArray()
            res.send(result)
        })

        // public, not secured , all recipes with pagination and searching and filtering;
        app.get('/api/public/recipes', async (req: Request, res: Response) => {
            const { search, cuisine, difficult, sortBy } = req.query as {
                search?: string,
                cuisine?: string,
                difficult?: string,
                sortBy?: string,
            };
            const query: Record<string, any> = {};
            if (search?.trim()) {
                query.$or = [
                    { title: { $regex: search, $options: "i" } },
                    { shortDesc: { $regex: search, $options: "i" } },

                ]
            };
            if (cuisine) query.cuisine = cuisine;
            if (difficult) query.difficulty = difficult;

            let sortQuery = {}
            if (sortBy === 'newest') {
                sortQuery = { createdAt: -1 }
            }
            if (sortBy === 'oldest') {
                sortQuery = { createdAt: 1 };
            }

            const page = Number(req.query.page || 1);
            const perPage = 12;
            const skipItems = (page - 1) * perPage;


            try {
                const totalRecipe = await recipeCollection.countDocuments(query);
                const recipes = await recipeCollection.find(query)
                    .sort(sortQuery)
                    .skip(skipItems)
                    .limit(perPage)
                    .toArray();
                res.status(200).send({ recipes, totalRecipe });
            }

            catch (error) {
                res.status(500).json({ success: false, message: "Failed to fetch recipes." });
            }


        });

        // get recipe by id not secured;
        app.get('/api/recipes/:id', async (req: Request, res: Response) => {
            const { id } = req.params as { id: string };
            const result = await recipeCollection.findOne({ _id: new ObjectId(id) });
            res.send(result || {})
        })

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