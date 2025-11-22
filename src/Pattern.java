import java.util.Scanner;
/**
 * The {@code Pattern} class prints a square pattern of asterisks ('*') to the console.
 * <p>
 * The size of the square is determined by user input. For a given integer {@code n},
 * the program outputs an {@code n} x {@code n} grid of asterisks.
 * </p>
 * <p>
 * Example output for {@code n = 3}:
 * <pre>
 * ***
 * ***
 * ***
 * </pre>
 * </p>
 *
 * Usage:
 * <ul>
 *   <li>Run the program.</li>
 *   <li>Enter a positive integer to specify the size of the pattern.</li>
 * </ul>
 */
public class Pattern {
    /**
     * @param args
     */
    public static void main(String[] args) {
        Scanner sc=new Scanner(System.in);
        int n=sc.nextInt();
        for(int i=0;i<n;i++){
            for(int j=0;j<n;j++){
                System.out.print("*");
            }
            System.out.println();
        }
        sc.close();
    }

    @Override
    public String toString() {
        return "Pattern []";
    }

}