import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { BbcHausaScraper } from './scraper/bbc-hausa.scraper';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: '*', // Allow all origins — adjust as needed for security
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });
  await app.listen(9308);
  const scraper = new BbcHausaScraper();
  console.log(
    await scraper.extractParagraphs(
      'https://www.bbc.com/hausa/topics/c4nx34q5724t',
    ),
  );
  console.log('app Listening at port 9308');
}
bootstrap();
