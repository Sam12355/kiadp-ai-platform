import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('Cloud:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('Key:', process.env.CLOUDINARY_API_KEY?.substring(0, 6) + '...');
console.log('Secret set:', !!process.env.CLOUDINARY_API_SECRET);

const publicId = 'kiadp/documents/ezm0oiw9vk0qk5xgqgsm';

// 1. Test private_download_url with image/upload
const url1 = cloudinary.utils.private_download_url(publicId, 'pdf', {
  resource_type: 'image',
  type: 'upload',
});
console.log('\n1. image/upload download URL:', url1.substring(0, 120) + '...');
const resp1 = await fetch(url1);
console.log('   Status:', resp1.status, resp1.statusText);
if (!resp1.ok) console.log('   Body:', (await resp1.text()).substring(0, 300));
else console.log('   SUCCESS! bytes:', resp1.headers.get('content-length'));

// 2. Test private_download_url with raw/upload
const url2 = cloudinary.utils.private_download_url(publicId, 'pdf', {
  resource_type: 'raw',
  type: 'upload',
});
console.log('\n2. raw/upload download URL:', url2.substring(0, 120) + '...');
const resp2 = await fetch(url2);
console.log('   Status:', resp2.status, resp2.statusText);
if (!resp2.ok) console.log('   Body:', (await resp2.text()).substring(0, 300));
else console.log('   SUCCESS! bytes:', resp2.headers.get('content-length'));

// 3. Test Admin API resource lookup
console.log('\n3. Admin API resource lookup...');
try {
  const resource = await cloudinary.api.resource(publicId, { resource_type: 'image', type: 'upload' });
  console.log('   Found! type:', resource.type, 'resource_type:', resource.resource_type, 'format:', resource.format);
  console.log('   secure_url:', resource.secure_url?.substring(0, 100));
  console.log('   bytes:', resource.bytes);
} catch (e: any) {
  console.log('   Error:', e.error?.message || e.message);
  // Try raw
  try {
    const resource = await cloudinary.api.resource(publicId, { resource_type: 'raw', type: 'upload' });
    console.log('   Found as RAW! type:', resource.type, 'resource_type:', resource.resource_type);
    console.log('   secure_url:', resource.secure_url?.substring(0, 100));
  } catch (e2: any) {
    console.log('   Also not found as raw:', e2.error?.message || e2.message);
  }
}

process.exit(0);
