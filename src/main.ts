import { AppModule } from './app.module';
import { CommandFactory } from 'nest-commander';

async function bootstrap() {
  await CommandFactory.run(AppModule, {
    logger: false,
    serviceErrorHandler: (error) => {
      console.error(error);
      process.exit(1);
    },
  });
}

void bootstrap();
