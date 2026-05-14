import { Module } from '@nestjs/common';
import { ContactsModule } from './contacts/contacts.module';
import { NewsletterModule } from './newsletter/newsletter.module';

@Module({
  imports: [ContactsModule, NewsletterModule]
})
export class CrmModule {}