import { v2 as cloudinary } from 'cloudinary';
import { getEnv } from '../config/env.js';

let isConfigured = false;

/**
 * Configure Cloudinary using environment variables
 */
const configure = () => {
  if (isConfigured) return;
  
  const env = getEnv();
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
    isConfigured = true;
  }
};

/**
 * Uploads a local file to Cloudinary
 * @param filePath Path to the local file
 * @param folder Cloudinary folder to store the file in
 * @returns The secure URL of the uploaded file, or null if Cloudinary is not configured or upload fails
 */
export const uploadToCloudinary = async (filePath: string, folder: string = 'kiadp'): Promise<string | null> => {
  configure();
  
  if (!isConfigured) {
    console.warn('Cloudinary is not configured. Falling back to local storage URLs.');
    return null;
  }

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'auto',
    });
    return result.secure_url;
  } catch (error) {
    console.error('❌ Cloudinary upload error:', error);
    return null;
  }
};

/**
 * Uploads a buffer to Cloudinary
 * @param buffer The image buffer
 * @param folder Cloudinary folder
 * @param fileName Original filename or specific name
 */
export const uploadBufferToCloudinary = async (
  buffer: Buffer,
  folder: string = 'kiadp/images',
  fileName?: string
): Promise<string | null> => {
  configure();
  if (!isConfigured) return null;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: fileName ? fileName.split('.')[0] : undefined,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary Buffer Upload Error:', error);
          resolve(null);
        } else {
          resolve(result?.secure_url || null);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Deletes a file from Cloudinary using its public ID
 * @param publicId The public ID of the file in Cloudinary
 */
export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  configure();
  if (!isConfigured) return;

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('❌ Cloudinary deletion error:', error);
  }
};
