import Razorpay from 'razorpay';
import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';
export const razorpay = new Razorpay({key_id:env.RAZORPAY_KEY_ID,key_secret:env.RAZORPAY_KEY_SECRET});
cloudinary.config({cloud_name:env.CLOUDINARY_CLOUD_NAME,api_key:env.CLOUDINARY_API_KEY,api_secret:env.CLOUDINARY_API_SECRET,secure:true});
export { cloudinary };
