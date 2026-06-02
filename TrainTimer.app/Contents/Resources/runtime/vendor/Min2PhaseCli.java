import cs.min2phase.Search;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public class Min2PhaseCli {
  public static void main(String[] args) throws Exception {
    if (args.length >= 1 && "--server".equals(args[0])) {
      runServer();
      return;
    }

    if (args.length < 1) {
      System.err.println("Usage: Min2PhaseCli <facelets> [maxDepth] [probeMax]");
      System.exit(2);
    }

    String facelets = args[0];
    int maxDepth = args.length > 1 ? Integer.parseInt(args[1]) : 25;
    long probeMax = args.length > 2 ? Long.parseLong(args[2]) : 1000000L;
    Search search = new Search();
    System.out.println(search.solution(facelets, maxDepth, probeMax, 0L, 0));
  }

  private static void runServer() throws Exception {
    Search.init();
    System.out.println("READY");
    System.out.flush();
    Search search = new Search();
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;

    while ((line = reader.readLine()) != null) {
      if (line.isBlank()) continue;
      String[] parts = line.split("\t", 4);
      String id = parts.length > 0 ? parts[0] : "0";
      try {
        if (parts.length < 2) throw new IllegalArgumentException("Missing facelets");
        String facelets = parts[1];
        int maxDepth = parts.length > 2 && !parts[2].isBlank() ? Integer.parseInt(parts[2]) : 25;
        long probeMax = parts.length > 3 && !parts[3].isBlank() ? Long.parseLong(parts[3]) : 1000000L;
        String solution = search.solution(facelets, maxDepth, probeMax, 0L, 0).trim();
        if (solution.startsWith("Error")) {
          System.out.println(id + "\tERR\t" + solution);
        } else {
          System.out.println(id + "\tOK\t" + solution);
        }
      } catch (Exception error) {
        System.out.println(id + "\tERR\t" + error.getMessage().replace('\t', ' '));
      }
      System.out.flush();
    }
  }
}
