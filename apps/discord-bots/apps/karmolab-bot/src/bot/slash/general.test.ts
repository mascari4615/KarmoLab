import { describe, it, expect, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import { handleHelp } from './general';
import { SLASH_COMMANDS } from './registry';

function helpInteraction(topic: string | null) {
  return { options: { getString: () => topic }, reply: vi.fn().mockResolvedValue(undefined) };
}

function commandPaths(name: string, options: any[] = []): string[] {
  const children = options.filter(({ type }) => type === 1 || type === 2);
  return children.length ? children.flatMap((child) => commandPaths(`${name} ${child.name}`, child.options)) : [name];
}

const paths = SLASH_COMMANDS.flatMap((command) => {
  const body = command.builder().toJSON();
  return commandPaths(`/${body.name}`, body.options);
});

describe('help follows the registered command surface', () => {
  it('lets users select the memory topic already advertised in help', () => {
    const command = SLASH_COMMANDS.find(({ name }) => name === '도움말')!.builder().toJSON();
    const topic = command.options!.find(({ name }) => name === '주제') as { choices: Array<{ value: string }> };
    expect(topic.choices.map(({ value }) => value)).toContain('memory');
  });

  it.each([null, 'overview', 'music', 'utility', 'memory'])('advertises registered paths in %s', async (topic) => {
    const interaction = helpInteraction(topic);
    await handleHelp({} as never, interaction as never);
    const reply = interaction.reply.mock.calls[0][0];
    expect(reply.flags).toBe(MessageFlags.Ephemeral);
    const body = JSON.stringify(reply.embeds[0].toJSON());
    const references = [...body.matchAll(/\/[\p{L}\p{N}_-]+(?: [\p{L}\p{N}_-]+){0,3}/gu)].map(([reference]) => reference);
    expect(references.length).toBeGreaterThan(0);
    const missing = references.filter((reference) => !paths.some((path) => path === reference || path.startsWith(reference + ' ') || reference.startsWith(path + ' ')));
    expect(missing).toEqual([]);
  });

  it('keeps unknown topics private and gives a return path', async () => {
    const interaction = helpInteraction('unknown');
    await handleHelp({} as never, interaction as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral, content: expect.stringContaining('/도움말') }));
  });
});
