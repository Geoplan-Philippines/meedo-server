import { buildIntegrationGuide } from './integration-guide';

describe('buildIntegrationGuide', () => {
  it('includes the paste-to-agent prompt, curl examples, and signature snippet', () => {
    const markdown = buildIntegrationGuide('https://api.example.com');
    expect(markdown).toContain('Paste this to your AI agent');
    expect(markdown).toContain('MEEDO_INTEGRATION_KEY');
    expect(markdown).toContain('https://api.example.com/api/v1/public/{orgSlug}/leads');
    expect(markdown).toContain('https://api.example.com/api/v1/public/{orgSlug}/subscribers');
    expect(markdown).toContain('X-Meedo-Signature: sha256=');
    expect(markdown).toContain("crypto.createHmac('sha256'");
  });
});
