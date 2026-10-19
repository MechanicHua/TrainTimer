import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;
import org.worldcubeassociation.tnoodle.scrambles.Puzzle;
import org.worldcubeassociation.tnoodle.scrambles.PuzzleRegistry;

// Same library calls as tnoodlecli.commands; retain puzzle tables between requests.
class TnoodleServer {
  public static void main(String[] args) throws Exception {
    BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = input.readLine()) != null) {
      String[] fields = line.split("\t", -1);
      String id = fields[0];
      try {
        Puzzle puzzle = PuzzleRegistry.valueOf(fields[2].toUpperCase(Locale.ROOT)).getScrambler();
        String output;
        if (fields[1].equals("scramble")) output = puzzle.generateScrambles(1)[0];
        else if (fields[1].equals("draw")) output = puzzle.drawScramble(new String(Base64.getDecoder().decode(fields[3]), StandardCharsets.UTF_8), null).toString();
        else throw new IllegalArgumentException("Unknown command");
        System.out.println(id + "\tOK\t" + Base64.getEncoder().encodeToString(output.getBytes(StandardCharsets.UTF_8)));
      } catch (Exception error) {
        System.out.println(id + "\tERR\t" + Base64.getEncoder().encodeToString(error.toString().getBytes(StandardCharsets.UTF_8)));
      }
      System.out.flush();
    }
  }
}
