import { describe, expect, it } from 'vitest';
import { logCandidates, parseLibraryFolders } from '../src/main/log-path';

// libraryfolders.vdf real escapa as barras: "D:\\SteamLibrary"
const VDF = String.raw`"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"apps" { "228980" "1" }
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
		"apps" { "1974050" "123" }
	}
}`;

describe('log-path', () => {
  it('parses Steam library folders', () => {
    expect(parseLibraryFolders(VDF)).toEqual([String.raw`C:\Program Files (x86)\Steam`, String.raw`D:\SteamLibrary`]);
  });

  it('builds candidate log paths for each library', () => {
    const c = logCandidates([String.raw`D:\SteamLibrary`]);
    expect(c).toContain(
      String.raw`D:\SteamLibrary\steamapps\common\Torchlight Infinite\UE_game\TorchLight\Saved\Logs\UE_game.log`,
    );
  });
});
