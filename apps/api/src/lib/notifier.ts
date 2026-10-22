/** Plan section 1: Termii (SMS) and Resend (email) behind one interface; the dev notifier just records. */
export interface Message {
  channel: 'sms' | 'email';
  to: string;
  template: string;
  text: string;
}
export interface Notifier {
  send(m: Message): Promise<{ providerRef: string }>;
}

export class DevNotifier implements Notifier {
  readonly sent: Message[] = [];
  constructor(private readonly log: (m: Message) => void = () => {}) {}
  async send(m: Message) {
    this.sent.push(m);
    this.log(m);
    return { providerRef: `dev-${this.sent.length}` };
  }
}
