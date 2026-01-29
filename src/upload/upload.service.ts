import { Injectable } from '@nestjs/common';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UploadService {
  private readonly s3Client = new S3Client({
    endpoint: this.configService.getOrThrow('R2_ENDPONT'),
    region: this.configService.getOrThrow('R2_REGION'),
    credentials: {
      accessKeyId: this.configService.getOrThrow('R2_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.getOrThrow('R2_SECRET_ACCESS_KEY'),
    },
  });

  constructor(private readonly configService: ConfigService) {}

  async upload({ filePath, file }: { filePath: string; file: Buffer }) {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: 'ai-bridge',
          Key: filePath,
          Body: file,
        }),
      );
      return {
        success: true,
        key: filePath,
      };
    } catch (err) {
      console.error('There was an error uploading file to S3:', err);
      throw new Error('File upload failed');
    }
  }

  async getFileUrl(filePath: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: 'ai-bridge',
        Key: filePath,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (err) {
      console.error('Error generating file URL:', err);
      throw new Error('Failed to generate file URL');
    }
  }

  async deleteFile(filePath: string) {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: 'ai-bridge',
          Key: filePath,
        }),
      );
      return { success: true, message: 'File deleted successfully' };
    } catch (err) {
      console.error('There was an error deleting file from S3:', err);
      throw new Error('File deletion failed');
    }
  }
}
