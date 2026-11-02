import { BaseError } from '../../common/exceptions/base.exception';

export class TelegramDeliveryError extends BaseError {
  constructor(message: string = 'Telegram message delivery failed') {
    super(message);
    this.name = 'TelegramDeliveryError';
    this.code = 'TELEGRAM_DELIVERY_ERROR';
    this.statusCode = 502;
  }
}
