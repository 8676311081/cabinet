import type {
  Channel,
  ChannelRepository,
  ChatMessage,
  UpdateChannelInput,
} from "./repository";

export class MemoryChannelRepository implements ChannelRepository {
  private readonly channels = new Map<string, Channel>();
  private readonly messages = new Map<string, ChatMessage[]>();
  private messageCounter = 0;

  private cloneChannel(channel: Channel): Channel {
    return { ...channel, members: [...channel.members] };
  }

  private cloneMessage(message: ChatMessage): ChatMessage {
    return { ...message };
  }

  async listChannels(): Promise<Channel[]> {
    return Array.from(this.channels.values()).map((channel) => this.cloneChannel(channel));
  }

  async getChannel(slug: string): Promise<Channel | null> {
    const channel = this.channels.get(slug);
    return channel ? this.cloneChannel(channel) : null;
  }

  async createChannel(channel: Channel): Promise<void> {
    if (this.channels.has(channel.slug)) {
      throw new Error(`Channel "${channel.slug}" already exists`);
    }

    this.channels.set(channel.slug, this.cloneChannel(channel));
  }

  async updateChannel(slug: string, updates: UpdateChannelInput): Promise<Channel | null> {
    const channel = this.channels.get(slug);
    if (!channel) return null;

    const updated: Channel = {
      ...channel,
      ...updates,
      members: updates.members ? [...updates.members] : [...channel.members],
    };
    this.channels.set(slug, updated);
    return this.cloneChannel(updated);
  }

  getMessages(channelSlug: string, limit = 100, before?: string): ChatMessage[] {
    const messages = (this.messages.get(channelSlug) || [])
      .filter((message) => !before || message.createdAt < before)
      .slice(-limit)
      .map((message) => this.cloneMessage(message));

    return messages;
  }

  postMessage(
    channelSlug: string,
    fromId: string,
    fromType: ChatMessage["fromType"],
    content: string,
    replyTo?: string,
  ): ChatMessage {
    const message: ChatMessage = {
      id: `msg-${++this.messageCounter}`,
      channelSlug,
      fromId,
      fromType,
      content,
      replyTo,
      pinned: false,
      createdAt: new Date().toISOString(),
    };

    const existing = this.messages.get(channelSlug) || [];
    this.messages.set(channelSlug, [...existing, this.cloneMessage(message)]);
    return this.cloneMessage(message);
  }

  togglePin(messageId: string): boolean {
    for (const [channelSlug, messages] of this.messages.entries()) {
      const index = messages.findIndex((message) => message.id === messageId);
      if (index === -1) continue;

      const updated = [...messages];
      updated[index] = { ...updated[index], pinned: !updated[index].pinned };
      this.messages.set(channelSlug, updated);
      return updated[index].pinned;
    }

    return false;
  }

  getLatestMessageTime(channelSlug: string): string | null {
    const messages = this.messages.get(channelSlug) || [];
    return messages.length > 0 ? messages[messages.length - 1].createdAt : null;
  }
}
