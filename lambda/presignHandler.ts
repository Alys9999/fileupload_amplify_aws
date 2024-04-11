import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {getSignedUrl } from "@aws-sdk/s3-request-presigner"

exports.handler = async (event: any) => {
    const { fileName, fileType } = JSON.parse(event.body);
    const client = new S3Client({ region: process.env.AWS_REGION });

    const command = new PutObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: fileName,
        ContentType: fileType,
    });


    try {
        const presignedUrl = await getSignedUrl(client, command, { expiresIn: 60 });
        console.log(presignedUrl);
        return {
            statusCode: 200,
            headers: {"Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Origin": "*", 
            "Access-Control-Allow-Methods": "OPTIONS,POST,GET",}, 
            body: JSON.stringify({ url: presignedUrl }),
        };
    } catch (e) {
        console.log(e);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Could not generate a presigned URL" }),
        };
    }
};
