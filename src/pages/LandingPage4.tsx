import { motion, useInView, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import MojoMapQuiz from "@/components/MojoMapQuiz";
const R1 = [
  "M22.4,36.5L18.7,36.5L15.3,33.5L15.3,16L28.5,16L31.9,19L31.9,22.4L22.4,22.4L22.4,23.1L28.5,23.1L31.9,26.1L31.9,29.5L22.4,29.5L22.4,36.6L22.4,36.5ZM28,18.9L28,16.7L16,16.7L16,33.2L18.5,35.4L18.5,18.9L28,18.9ZM19.2,35.8L21.7,35.8L21.7,28.7L31.2,28.7L31.2,26.6L21.7,26.6L21.7,22.2L19.2,20L19.2,35.8ZM22.2,21.7L30.6,21.7L28.2,19.6L19.8,19.6L22.2,21.7ZM22.4,23.8L22.4,25.9L30.5,25.9L28.2,23.8L22.4,23.8ZM31.2,19.4L28.7,17.2L28.7,19.1L31.2,21.3L31.2,19.4Z",
  "M42.6,36.5C37.4,36.5 33.1,32.2 33.1,26C33.1,19.8 37.4,16 42.3,16L45.2,16C50.2,16 54.7,20 54.7,26.5C54.7,33 50.4,36.5 45.5,36.5L42.5,36.5L42.6,36.5ZM45.3,19.7C44.5,19.7 43.7,19.9 43.1,20.3C46.1,20.6 48.5,23.1 48.5,26.9C48.5,30.7 45.7,33.6 42.7,33.6C39.7,33.6 36.4,30.3 36.4,25.9C36.4,21.5 38.9,18.1 42,16.8C37.8,17 33.9,20.5 33.9,26.1C33.9,31.7 37.6,35.9 42.7,35.9C47.8,35.9 51,32.5 51,26.8C51,21.1 48.5,19.8 45.4,19.8L45.3,19.7ZM42.6,32.8C43.4,32.8 44.1,32.6 44.8,32.2C41.8,31.9 39.4,29.4 39.4,25.6C39.4,21.8 42.2,18.9 45.2,18.9C48.2,18.9 51.5,22.2 51.5,26.6C51.5,31 49.2,34.4 45.9,35.8C50.2,35.5 54,32.1 54,26.5C54,20.9 49.8,16.7 45.3,16.7C40.8,16.7 36.9,20.1 36.9,25.8C36.9,31.5 39.4,32.8 42.5,32.8L42.6,32.8ZM42,21C40.9,22 40.1,23.6 40.1,25.7C40.1,29.6 42.9,31.9 45.7,31.6C46.8,30.6 47.6,29 47.6,26.8C47.6,22.9 44.8,20.7 41.9,20.9L42,21Z",
  "M72,33.5L72,32.3L69.6,36.6L65.2,36.6L63.3,33.3L63.3,36.6L59.6,36.6L56.2,33.6L56.2,16L60.5,16L63.1,18.3L67.3,25.8L72.9,15.9L76.4,15.9L79,18.2L79,36.4L75.3,36.4L71.9,33.4L72,33.5ZM65.6,30.7L59,18.9L57,17.1L57,33.1L59.5,35.3L59.5,24.8L65.6,35.6L75.2,18.7L73.3,17L65.6,30.6L65.6,30.7ZM60.2,16.7L57.5,16.7L59.1,18.2L61.8,18.2L60.2,16.7ZM65.6,29.1L67,26.6L62.6,18.9L59.8,18.9L65.6,29.1ZM62.6,35.8L62.6,31.9L60.1,27.5L60.1,35.7L62.6,35.7L62.6,35.8ZM78.4,35.8L78.4,18.9L75.9,18.9L66.3,35.8L69.1,35.8L75.9,23.8L75.9,35.8L78.4,35.8ZM72.7,31L72.7,33.2L75.2,35.4L75.2,26.6L72.7,31ZM76.3,16.7L74,16.7L75.7,18.2L77.9,18.2L76.3,16.7Z",
  "M90.1,36.5C84.9,36.5 80.6,32.2 80.6,26C80.6,19.8 84.9,16 89.8,16L92.7,16C97.7,16 102.2,20 102.2,26.5C102.2,33 97.9,36.5 93,36.5L90,36.5L90.1,36.5ZM92.8,19.7C92,19.7 91.2,19.9 90.6,20.3C93.6,20.6 96,23.1 96,26.9C96,30.7 93.2,33.6 90.2,33.6C87.2,33.6 83.9,30.3 83.9,25.9C83.9,21.5 86.4,18.1 89.5,16.8C85.3,17 81.4,20.5 81.4,26.1C81.4,31.7 85.1,35.9 90.2,35.9C95.3,35.9 98.5,32.5 98.5,26.8C98.5,21.1 95.9,19.8 92.9,19.8L92.8,19.7ZM90.1,32.8C90.9,32.8 91.6,32.6 92.3,32.2C89.3,31.9 86.9,29.4 86.9,25.6C86.9,21.8 89.7,18.9 92.7,18.9C95.7,18.9 99,22.2 99,26.6C99,31 96.7,34.4 93.4,35.8C97.7,35.5 101.5,32.1 101.5,26.5C101.5,20.9 97.3,16.7 92.8,16.7C88.3,16.7 84.4,20.1 84.4,25.8C84.4,31.5 87,32.8 90,32.8L90.1,32.8ZM89.5,21C88.4,22 87.6,23.6 87.6,25.7C87.6,29.6 90.4,31.9 93.2,31.6C94.3,30.6 95.1,29 95.1,26.8C95.1,22.9 92.3,20.7 89.4,20.9L89.5,21Z",
];
const R2 = [
  "M31.1,65.3L31.1,64.1L28.7,68.4L24.3,68.4L22.4,65.1L22.4,68.4L18.7,68.4L15.3,65.4L15.3,47.9L19.6,47.9L22.2,50.2L26.4,57.7L32,47.8L35.5,47.8L38.1,50.1L38.1,68.3L34.4,68.3L31,65.2L31.1,65.3ZM24.6,62.5L18,50.7L16,48.9L16,64.9L18.5,67.1L18.5,56.6L24.6,67.4L34.2,50.5L32.3,48.8L24.6,62.4L24.6,62.5ZM19.3,48.5L16.6,48.5L18.2,50L20.9,50L19.3,48.5ZM24.6,60.9L26,58.4L21.6,50.7L18.8,50.7L24.6,60.9ZM21.7,67.7L21.7,63.8L19.2,59.5L19.2,67.7L21.7,67.7ZM37.5,67.7L37.5,50.8L35,50.8L25.4,67.7L28.2,67.7L35,55.7L35,67.7L37.5,67.7ZM31.8,62.8L31.8,65L34.3,67.2L34.3,58.4L31.8,62.8ZM35.4,48.5L33.1,48.5L34.8,50L37,50L35.4,48.5Z",
  "M49.5,68.4C44.3,68.4 40,64.1 40,57.9C40,51.7 44.3,47.9 49.2,47.9L52.1,47.9C57.1,47.9 61.6,51.9 61.6,58.4C61.6,64.9 57.3,68.4 52.4,68.4L49.4,68.4L49.5,68.4ZM52.2,51.5C51.4,51.5 50.6,51.7 50,52.1C53,52.4 55.4,54.9 55.4,58.7C55.4,62.5 52.6,65.4 49.6,65.4C46.6,65.4 43.3,62.1 43.3,57.7C43.3,53.3 45.8,49.9 48.9,48.5C44.7,48.7 40.8,52.2 40.8,57.8C40.8,63.4 44.5,67.6 49.6,67.6C54.7,67.6 57.9,64.2 57.9,58.5C57.9,52.8 55.4,51.5 52.3,51.5L52.2,51.5ZM49.5,64.7C50.3,64.7 51,64.5 51.7,64.1C48.7,63.8 46.3,61.3 46.3,57.5C46.3,53.7 49.1,50.8 52.1,50.8C55.1,50.8 58.4,54.1 58.4,58.5C58.4,62.9 56.1,66.3 52.8,67.7C57.1,67.4 60.9,64 60.9,58.4C60.9,52.8 56.7,48.6 52.2,48.6C47.7,48.6 43.8,52 43.8,57.7C43.8,63.4 46.3,64.7 49.4,64.7L49.5,64.7ZM49,52.8C47.9,53.8 47.1,55.4 47.1,57.5C47.1,61.4 49.9,63.7 52.7,63.4C53.8,62.4 54.6,60.7 54.6,58.6C54.6,54.8 51.8,52.4 48.9,52.7L49,52.8Z",
  "M65,59.2L69,59.2C69,61.5 69.6,63.2 71.4,63.7C71.8,63.2 72,62.5 72,61.5L72,54.3L64.6,54.3L64.6,50.9L68,47.9L79.1,47.9L79.1,61.8C79.1,65.8 76.3,68.5 72.3,68.5L69.4,68.5C65.4,68.5 62.4,65.9 62.4,61.7L65.1,59.3L65,59.2ZM69.3,65.3C67.4,65.3 65.2,64.2 65.1,60.1L63.1,61.9C63.2,65.4 65.8,67.6 69.4,67.6C73,67.6 75.2,65.3 75.2,61.6L75.2,51.8L72.7,54L72.7,61.4C72.7,64 71.4,65.3 69.3,65.3ZM65.3,53L67.8,50.8L67.8,48.9L65.3,51.1L65.3,53ZM68.3,59.9L65.7,59.9C65.8,63.8 67.7,64.7 69.2,64.7C70.7,64.7 70.3,64.6 70.7,64.3C68.9,63.6 68.3,61.8 68.2,59.9L68.3,59.9ZM72.2,53.5L74.6,51.4L68.3,51.4L65.9,53.5L72.2,53.5ZM75.8,61.7C75.8,64.5 74.6,66.7 72.4,67.7C75.9,67.7 78.3,65.2 78.3,61.7L78.3,48.6L68.5,48.6L68.5,50.7L75.9,50.7L75.9,61.7L75.8,61.7Z",
  "M90.1,68.4C84.9,68.4 80.6,64.1 80.6,57.9C80.6,51.7 84.9,47.9 89.8,47.9L92.7,47.9C97.7,47.9 102.2,51.9 102.2,58.4C102.2,64.9 97.9,68.4 93,68.4L90,68.4L90.1,68.4ZM92.8,51.5C92,51.5 91.2,51.7 90.6,52.1C93.6,52.4 96,54.9 96,58.7C96,62.5 93.2,65.4 90.2,65.4C87.2,65.4 83.9,62.1 83.9,57.7C83.9,53.3 86.4,49.9 89.5,48.5C85.3,48.7 81.4,52.2 81.4,57.8C81.4,63.4 85.1,67.6 90.2,67.6C95.3,67.6 98.5,64.2 98.5,58.5C98.5,52.8 95.9,51.5 92.9,51.5L92.8,51.5ZM90.1,64.7C90.9,64.7 91.6,64.5 92.3,64.1C89.3,63.8 86.9,61.3 86.9,57.5C86.9,53.7 89.7,50.8 92.7,50.8C95.7,50.8 99,54.1 99,58.5C99,62.9 96.7,66.3 93.4,67.7C97.7,67.4 101.5,64 101.5,58.4C101.5,52.8 97.3,48.6 92.8,48.6C88.3,48.6 84.4,52 84.4,57.7C84.4,63.4 87,64.7 90,64.7L90.1,64.7ZM89.5,52.8C88.4,53.8 87.6,55.4 87.6,57.5C87.6,61.4 90.4,63.7 93.2,63.4C94.3,62.4 95.1,60.7 95.1,58.6C95.1,54.8 92.3,52.4 89.4,52.7L89.5,52.8Z",
];
const R3 = [
  "M23.7,79.7C30.8,79.7 34.8,83.8 34.8,90C34.8,96.2 30.4,100.3 24.3,100.3L18.7,100.3L15.3,97.3L15.3,79.8L23.7,79.8L23.7,79.7ZM24.3,99.5C30.1,99.5 34.1,95.8 34.1,89.9C34.1,84 30.4,80.3 23.7,80.3L16,80.3L16,96.6L23.5,96.6C28.1,96.6 30.9,93.9 30.9,89.9C30.9,85.9 28.2,83.2 23.5,83.2L19.8,83.2L22.2,85.3L23.6,85.3C26.7,85.3 28.5,87.1 28.5,89.9C28.5,92.7 26.7,94.5 23.6,94.5L18.5,94.5L18.5,82.5L23.6,82.5C28.6,82.5 31.7,85.6 31.7,89.9C31.7,94.2 28.6,97.3 23.6,97.3L16.6,97.3L19,99.4L24.2,99.4L24.3,99.5ZM19.2,93.8L21.7,93.8L21.7,85.9L19.2,83.7L19.2,93.9L19.2,93.8ZM22.4,86L22.4,93.8L23.6,93.8C26.3,93.8 27.8,92.3 27.8,89.9C27.8,87.5 26.3,86 23.6,86L22.4,86Z",
  "M46.8,100.2C41.6,100.2 37.3,95.9 37.3,89.6C37.3,83.3 41.6,79.6 46.5,79.6L49.4,79.6C54.4,79.6 58.9,83.6 58.9,90.2C58.9,96.8 54.6,100.2 49.7,100.2L46.7,100.2L46.8,100.2ZM49.5,83.4C48.7,83.4 47.9,83.6 47.3,84C50.3,84.3 52.7,86.8 52.7,90.6C52.7,94.4 49.9,97.3 46.9,97.3C43.9,97.3 40.6,94 40.6,89.6C40.6,85.2 43.1,81.8 46.2,80.4C42,80.6 38.1,84.1 38.1,89.7C38.1,95.3 41.8,99.5 46.9,99.5C52,99.5 55.2,96.1 55.2,90.4C55.2,84.7 52.7,83.4 49.6,83.4L49.5,83.4ZM46.8,96.5C47.6,96.5 48.3,96.3 49,95.9C46,95.6 43.6,93.1 43.6,89.3C43.6,85.5 46.4,82.6 49.4,82.6C52.4,82.6 55.7,85.9 55.7,90.3C55.7,94.7 53.4,98.1 50.1,99.5C54.4,99.2 58.2,95.8 58.2,90.2C58.2,84.6 54,80.4 49.5,80.4C45,80.4 41.1,83.8 41.1,89.5C41.1,95.2 43.6,96.5 46.7,96.5L46.8,96.5ZM46.2,84.6C45.1,85.6 44.3,87.2 44.3,89.3C44.3,93.2 47.1,95.5 49.9,95.2C51,94.2 51.8,92.5 51.8,90.4C51.8,86.6 49,84.2 46.1,84.5L46.2,84.6Z",
  "M63.6,91L67.6,91C67.6,93.3 68.2,95 70,95.5C70.4,95 70.6,94.3 70.6,93.3L70.6,86.1L63.2,86.1L63.2,82.7L66.6,79.7L77.7,79.7L77.7,93.6C77.7,97.6 74.9,100.3 70.9,100.3L68,100.3C64,100.3 61,97.7 61,93.5L63.7,91.1L63.6,91ZM67.9,97.2C66,97.2 63.8,96.1 63.7,92L61.7,93.8C61.8,97.3 64.4,99.5 68,99.5C71.6,99.5 73.8,97.2 73.8,93.5L73.8,83.7L71.3,85.9L71.3,93.3C71.3,95.9 70,97.2 67.9,97.2ZM63.9,84.9L66.4,82.7L66.4,80.8L63.9,83L63.9,84.9ZM66.9,91.7L64.3,91.7C64.4,95.6 66.3,96.5 67.8,96.5C69.3,96.5 68.9,96.4 69.3,96.1C67.5,95.4 66.9,93.6 66.8,91.7L66.9,91.7ZM70.8,85.3L73.2,83.2L66.9,83.2L64.5,85.3L70.8,85.3ZM74.5,93.5C74.5,96.3 73.3,98.5 71.1,99.5C74.6,99.5 77,97 77,93.5L77,80.3L67.2,80.3L67.2,82.4L74.6,82.4L74.6,93.4L74.5,93.5Z",
  "M90.1,100.2C84.9,100.2 80.6,95.9 80.6,89.6C80.6,83.3 84.9,79.6 89.8,79.6L92.7,79.6C97.7,79.6 102.2,83.6 102.2,90.2C102.2,96.8 97.9,100.2 93,100.2L90,100.2L90.1,100.2ZM92.8,83.4C92,83.4 91.2,83.6 90.6,84C93.6,84.3 96,86.8 96,90.6C96,94.4 93.2,97.3 90.2,97.3C87.2,97.3 83.9,94 83.9,89.6C83.9,85.2 86.4,81.8 89.5,80.4C85.3,80.6 81.4,84.1 81.4,89.7C81.4,95.3 85.1,99.5 90.2,99.5C95.3,99.5 98.5,96.1 98.5,90.4C98.5,84.7 95.9,83.4 92.9,83.4L92.8,83.4ZM90.1,96.5C90.9,96.5 91.6,96.3 92.3,95.9C89.3,95.6 86.9,93.1 86.9,89.3C86.9,85.5 89.7,82.6 92.7,82.6C95.7,82.6 99,85.9 99,90.3C99,94.7 96.7,98.1 93.4,99.5C97.7,99.2 101.5,95.8 101.5,90.2C101.5,84.6 97.3,80.4 92.8,80.4C88.3,80.4 84.4,83.8 84.4,89.5C84.4,95.2 87,96.5 90,96.5L90.1,96.5ZM89.6,84.6C88.5,85.6 87.7,87.2 87.7,89.3C87.7,93.2 90.5,95.5 93.3,95.2C94.4,94.2 95.2,92.5 95.2,90.4C95.2,86.6 92.4,84.2 89.5,84.5L89.6,84.6Z",
];

function LogoGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="112" spreadMethod="repeat">
      <stop offset="0%" stopColor="#111" />
      <stop offset="45%" stopColor="#7d5200" />
      <stop offset="100%" stopColor="#111" />
      <animateTransform attributeName="gradientTransform" type="translate" from="0,0" to="0,-112" dur="3s" repeatCount="indefinite" />
    </linearGradient>
  );
}

const LogoFull = () => (
  <svg viewBox="0 0 121 112" className="v4-logo-svg" aria-label="FOMO MOJO DOJO">
    <defs>
      <LogoGradient id="v4-lg-full" />
      <clipPath id="v4-cp-full">
        {[...R1, ...R2, ...R3].map((d, i) => <path key={i} d={d} />)}
      </clipPath>
    </defs>
    <rect x="-5" y="-5" width="131" height="122" fill="url(#v4-lg-full)" clipPath="url(#v4-cp-full)" />
  </svg>
);

const LogoRow = ({ row }: { row: 1 | 2 | 3 }) => {
  const vbY = row === 1 ? 12 : row === 2 ? 44 : 76;
  const lgId = `v4-lg-r${row}`;
  const cpId = `v4-cp-r${row}`;
  const paths = row === 1 ? R1 : row === 2 ? R2 : R3;
  return (
    <svg viewBox={`0 ${vbY} 121 28`} className="v4-logo-row-svg">
      <defs>
        <LogoGradient id={lgId} />
        <clipPath id={cpId}>
          {paths.map((d, i) => <path key={i} d={d} />)}
        </clipPath>
      </defs>
      <rect x="-5" y="-5" width="131" height="122" fill={`url(#${lgId})`} clipPath={`url(#${cpId})`} />
    </svg>
  );
};

/* ════════════════════════════════════════════════════════
   LANDING PAGE 4 — Updated with new design tokens
   tokens.css: page-bg #efefec, paper #fff, ink #111,
   highlight #fff3c4, Inter + JetBrains Mono
   ════════════════════════════════════════════════════════ */

const Section = ({
  children,
  className = "",
  snapAlign = true,
  caption,
}: {
  children: React.ReactNode;
  className?: string;
  snapAlign?: boolean;
  caption?: string;
}) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <motion.section
      ref={ref}
      className={`v4-sec ${snapAlign ? "snap-start snap-always" : ""} ${className}`}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {caption && <div className="v4-caption">{caption}</div>}
      <div className="v4-sec-inner">{children}</div>
    </motion.section>
  );
};

const StaggerLines = ({
  lines,
  className = "",
}: {
  lines: string[];
  className?: string;
}) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  return (
    <div ref={ref} className={className}>
      {lines.map((line, i) => (
        <motion.p
          key={i}
          className="v4-lead"
          initial={{ opacity: 0, y: 14 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: i * 0.15, duration: 0.6 }}
        >
          {line}
        </motion.p>
      ))}
    </div>
  );
};

const LandingPage4 = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (quizOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [quizOpen]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let lastSection = 0;
    let scrollEndTimer: ReturnType<typeof setTimeout>;
    let lockTimer: ReturnType<typeof setTimeout>;

    const onScroll = () => {
      clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(() => {
        const currentTop = container.scrollTop;
        const sectionHeight = window.innerHeight;
        const currentSection = Math.round(currentTop / sectionHeight);

        if (
          Math.abs(currentTop - currentSection * sectionHeight) < 5 &&
          currentSection !== lastSection
        ) {
          lastSection = currentSection;
          container.style.overflowY = "hidden";
          lockTimer = setTimeout(() => {
            container.style.overflowY = "auto";
          }, 1000);
        }
      }, 80);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      clearTimeout(scrollEndTimer);
      clearTimeout(lockTimer);
    };
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [dropdownOpen]);

  const scrollToQuiz = () => setQuizOpen(true);

  return (
    <div className="v4-root">
      <Styles />

        {/* ════════ HEADER ════════ */}
        <div className="v4-header-wrap" ref={headerRef}>
          <header className="v4-header">
            <div aria-hidden />

            <motion.button
              className="v4-mark-logo"
              onClick={() => setDropdownOpen(d => !d)}
              animate={{ opacity: dropdownOpen ? 0.18 : 1 }}
              transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
              aria-expanded={dropdownOpen}
              aria-label="Toggle menu"
            >
              <LogoFull />
            </motion.button>

            <nav className="v4-nav">
              <Link to="/process/mojomap">MojoMap™</Link>
            </nav>
          </header>

          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                className="v4-dropdown"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <div className="v4-dropdown-grid">
                  {(
                    [
                      { row: 1 as const, title: "The Focus Killer", paras: ["Feeling pulled in every direction? FOMO is the anxiety you're not working on the right thing. It kills focus and momentum.", "We cut through the noise and make what matters obvious."] },
                      { row: 2 as const, title: "Your Unfair Advantage", paras: ["MOJO is what happens when your team has real clarity. You know where you're going, why it matters, and what to do next.", "That's when momentum kicks in."] },
                      { row: 3 as const, title: "Your Path to Mastery", paras: ["The DOJO is how you get there. A system, not advice — designed to build the muscle for clear thinking and better decisions.", "So you don't need us forever."] },
                    ] as const
                  ).map(({ row, title, paras }, i) => (
                    <motion.div
                      key={row}
                      className="v4-dropcol"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, delay: 0.08 + i * 0.08, ease: [0.2, 0.7, 0.2, 1] }}
                    >
                      <div className="v4-dropcol-logo"><LogoRow row={row} /></div>
                      <h4 className="v4-dropcol-title">{title}</h4>
                      {paras.map((p, j) => <p key={j} className="v4-body">{p}</p>)}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      <div
        ref={scrollContainerRef}
        className="v4-scroll snap-y snap-mandatory"
      >
        {/* ════════ HERO ════════ */}
        <Section caption="DECISION SYSTEM · MOJOMAP" className="v4-hero">
          <motion.h1
            className="v4-display"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
          >
            We help you see what{"\u2019"}s actually driving your business
            <span className="v4-display-mark">
              {" "}
              <em>so you can move with clarity.</em>
            </span>
          </motion.h1>

          <motion.p
            className="v4-lead v4-mt-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.6 }}
          >
            We bring together market context, customer understanding, and real
            evidence — to map the routes forward and show which paths are most
            likely to succeed.
          </motion.p>

          <motion.p
            className="v4-body v4-mt-md v4-italic"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.6 }}
          >
            Most teams aren{"\u2019"}t missing effort. They{"\u2019"}re working
            across too many possible directions without a clear definition of
            what actually matters.
          </motion.p>

          <motion.div
            className="v4-cta-row v4-mt-lg"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5 }}
          >
            <button onClick={scrollToQuiz} className="v4-btn v4-btn-primary">
              SEE WHAT MIGHT BE HOLDING YOU BACK <span aria-hidden className="v4-btn-arrow">→</span>
            </button>
          </motion.div>

          <motion.div
            className="v4-mt-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.0, duration: 0.7 }}
          >
            <SourceDiagram />
          </motion.div>

          <motion.div
            className="v4-scroll-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.4 }}
          >
            <span>SCROLL</span>
            <svg width="14" height="22" viewBox="0 0 14 22" className="v4-arrow-bounce">
              <path d="M7 2v16m-4-4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
            </svg>
          </motion.div>
        </Section>

        {/* ════════ BRIDGE ════════ */}
        <Section caption="01 · BRIDGE">
          <StaggerLines
            lines={[
              "Clarity doesn\u2019t come from looking at your business in isolation.",
            ]}
          />
          <motion.p
            className="v4-body v4-mt-md"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            It comes from understanding the market you{"\u2019"}re operating
            in, what your customers are trying to achieve, and what the
            evidence is really telling you.
          </motion.p>
          <motion.p
            className="v4-pull v4-mt-xl"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ delay: 0.7, duration: 0.7 }}
          >
            <em>That{"\u2019"}s where we begin.</em>
          </motion.p>
        </Section>

        {/* ════════ MAP ════════ */}
        <Section caption="02 · MAP">
          <h2 className="v4-h2">How clarity actually builds</h2>

          <div className="v4-grid v4-mt-xl">
            {[
              {
                num: "01",
                head: "Define the market",
                body: "Get clear on where you\u2019re playing and what matters there",
              },
              {
                num: "02",
                head: "Understand your customer",
                body: "See what they\u2019re actually trying to achieve",
              },
              {
                num: "03",
                head: "Gather evidence",
                body: "Move from assumptions to signals you can trust",
              },
              {
                num: "04",
                head: "Choose the best route",
                body: "See which paths are most likely to succeed",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                className="v4-cell"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: 0.15 + i * 0.1,
                  duration: 0.55,
                  ease: [0.2, 0.7, 0.2, 1],
                }}
              >
                <div className="v4-cell-num">{item.num}</div>
                <div className="v4-cell-head">{item.head}</div>
                <div className="v4-cell-body">{item.body}</div>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* ════════ TENSION ════════ */}
        <Section caption="03 · TENSION">
          <motion.p
            className="v4-lead"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.7 }}
          >
            Without a clear view of the market, the customer, and the evidence,
            teams end up making important decisions with too much
            interpretation and not enough signal.
          </motion.p>
          <motion.p
            className="v4-pull v4-mt-xl"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ delay: 0.7, duration: 0.7 }}
          >
            <em>That{"\u2019"}s when progress gets expensive.</em>
          </motion.p>
        </Section>

        {/* ════════ QUIZ INTRO ════════ */}
        <Section caption="04 · INVITATION">
          <h2 className="v4-h2">
            Get a clear outside perspective on what might be holding you back
          </h2>

          <motion.p
            className="v4-body v4-mt-lg"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            In a few minutes, we{"\u2019"}ll reflect back:
          </motion.p>

          <ul className="v4-list v4-mt-md">
            {[
              "where things may not be lining up",
              "what signals may be getting missed",
              "where clarity may be limiting progress",
            ].map((line, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + i * 0.15, duration: 0.5 }}
              >
                <span className="v4-list-mark">—</span>
                <span>{line}</span>
              </motion.li>
            ))}
          </ul>

          <motion.p
            className="v4-body v4-mt-lg"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.9 }}
          >
            This isn{"\u2019"}t a diagnosis. It{"\u2019"}s a starting point —
            based on what you share.
          </motion.p>

          <motion.p
            className="v4-body v4-mt-md"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 1.1 }}
          >
            If it resonates, we{"\u2019"}ll use it as the foundation for a{" "}
            <em>free 45-minute conversation</em> to see whether there
            {"\u2019"}s a meaningful way we can help.
          </motion.p>

          <motion.div
            className="v4-cta-row v4-mt-xl"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 1.3 }}
          >
            <button onClick={scrollToQuiz} className="v4-btn v4-btn-primary">
              SEE WHAT MIGHT BE HOLDING YOU BACK <span aria-hidden className="v4-btn-arrow">→</span>
            </button>
          </motion.div>
        </Section>

        {/* ════════ START WITH CLARITY ════════ */}
        <Section caption="05 · NEXT">
          <h2 className="v4-h2">Start with clarity</h2>
          <p className="v4-body v4-mt-md">No prep. No pressure.</p>
          <p className="v4-body">
            You{"\u2019"}ll leave the first conversation with a clearer view of
            what matters.
          </p>

          <motion.div
            className="v4-cta-row v4-mt-xl"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <button onClick={scrollToQuiz} className="v4-btn v4-btn-primary">
              SEE WHAT MIGHT BE HOLDING YOU BACK <span aria-hidden className="v4-btn-arrow">→</span>
            </button>
          </motion.div>

          <div className="v4-steps v4-mt-xl">
            {[
              { n: "01", bold: "You", rest: "take the quiz, book a call" },
              { n: "02", bold: "We", rest: "create your initial map" },
              { n: "03", bold: "Together", rest: "we see if there is a fit" },
            ].map((step, i) => (
              <motion.div
                key={i}
                className="v4-step"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 + i * 0.15 }}
              >
                <span className="v4-step-num">{step.n}</span>
                <span className="v4-step-bold">{step.bold}</span>
                <span className="v4-step-rest">{step.rest}</span>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* ─── Footer ─── */}
        <footer className="v4-footer">
          <div className="v4-footer-row">
            <span>MOJOMAP™ · STRATEGIC DECISION SYSTEM</span>
            <span>© 2026</span>
          </div>
          <div className="v4-footer-links">
            <Link to="/assessment">ASSESSMENT</Link>
            <Link to="/stages">STAGES</Link>
          </div>
        </footer>
      </div>

      {/* ════════ QUIZ — bottom reveal ════════ */}
      <AnimatePresence>
        {quizOpen && (
          <>
            <motion.div
              className="v4-quiz-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              onClick={() => setQuizOpen(false)}
            />
            <motion.div
              className="v4-quiz-panel"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <div className="v4-quiz-inner">
                <MojoMapQuiz onClose={() => setQuizOpen(false)} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const DropCol = ({
  tag,
  title,
  paras,
}: {
  tag: string;
  title: string;
  paras: string[];
}) => (
  <div className="v4-dropcol">
    <div className="v4-caption">{tag}</div>
    <h4 className="v4-dropcol-title">{title}</h4>
    {paras.map((p, i) => (
      <p key={i} className="v4-body">
        {p}
      </p>
    ))}
  </div>
);

const SourceDiagram = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });
  const [hovered, setHovered] = useState<"outside" | "business" | "customer" | null>(null);
  const [animStage, setAnimStage] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const t1 = setTimeout(() => setAnimStage(1), 900);
    const t2 = setTimeout(() => setAnimStage(2), 1900);
    const t3 = setTimeout(() => setAnimStage(3), 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isInView]);

  const sources = [
    { id: "outside" as const,  label: "OUTSIDE",  desc: "What people see and say today",     color: "#111", delay: 0.2, scoreTarget: 15 },
    { id: "business" as const, label: "BUSINESS", desc: "What the company is hoping to be",  color: "#111", delay: 1.1, scoreTarget: 35 },
    { id: "customer" as const, label: "CUSTOMER", desc: "Where we validate what matters",    color: "#111", delay: 2.0, scoreTarget: 62 },
  ];

  const cx = 300, cy = 230;
  const vertices = {
    outside:  { x: 60,  y: 40  },
    business: { x: 540, y: 40  },
    customer: { x: 300, y: 440 },
  };

  const ringR = 86;
  const sw = 3;
  const r = ringR - sw;
  const C = 2 * Math.PI * r;

  const currentScore = animStage === 0 ? 0 : animStage === 1 ? 15 : animStage === 2 ? 35 : 62;
  const seg1 = (15 / 100) * C;
  const seg2 = ((35 - 15) / 100) * C;
  const seg3 = ((62 - 35) / 100) * C;

  return (
    <div ref={ref} className="v4-source">
      <div className="v4-source-frame" style={{ aspectRatio: "6/5" }}>
        <svg viewBox="0 0 600 500" className="v4-source-svg" fill="none">
          <defs>
            <pattern id="v4tri-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="#d9d9d9" strokeWidth="1" />
            </pattern>
          </defs>

          {sources.map((src) => {
            const v = vertices[src.id];
            return (
              <motion.line
                key={src.id}
                x1={v.x} y1={v.y} x2={cx} y2={cy}
                stroke={src.color}
                strokeWidth={hovered === src.id ? 1.6 : 1}
                strokeLinecap="square"
                opacity={hovered && hovered !== src.id ? 0.18 : 0.85}
                initial={{ pathLength: 0 }}
                animate={isInView ? { pathLength: 1 } : {}}
                transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1], delay: src.delay }}
              />
            );
          })}

          <circle cx={cx} cy={cy} r={r} stroke="#ededed" strokeWidth={sw} />

          <motion.circle
            cx={cx} cy={cy} r={r - 6}
            fill="#fff3c4"
            initial={{ opacity: 0 }}
            animate={{ opacity: animStage >= 1 ? 1 : 0 }}
            transition={{ duration: 0.6 }}
          />

          <motion.circle
            cx={cx} cy={cy} r={r}
            stroke="#111" strokeWidth={sw} fill="none"
            strokeDasharray={C}
            style={{ transformOrigin: `${cx}px ${cy}px`, transform: "rotate(-90deg)" }}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: animStage >= 1 ? C - seg1 : C }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            opacity={hovered && hovered !== "outside" ? 0.25 : 1}
          />

          <motion.circle
            cx={cx} cy={cy} r={r}
            stroke="#111" strokeWidth={sw} fill="none"
            strokeDasharray={`${seg2} ${C}`}
            style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${-90 + (15 / 100) * 360}deg)` }}
            initial={{ strokeDashoffset: seg2 }}
            animate={{ strokeDashoffset: animStage >= 2 ? 0 : seg2 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            opacity={hovered && hovered !== "business" ? 0.25 : 1}
          />

          <motion.circle
            cx={cx} cy={cy} r={r}
            stroke="#111" strokeWidth={sw} fill="none"
            strokeDasharray={`${seg3} ${C}`}
            style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${-90 + (35 / 100) * 360}deg)` }}
            initial={{ strokeDashoffset: seg3 }}
            animate={{ strokeDashoffset: animStage >= 3 ? 0 : seg3 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            opacity={hovered && hovered !== "customer" ? 0.25 : 1}
          />

          <motion.circle
            cx={cx} cy={cy} r={3}
            fill="#111"
            animate={{ opacity: animStage < 3 ? [0.3, 1, 0.3] : 0 }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        </svg>

        <div
          className="v4-source-score"
          style={{ left: `${(cx / 600) * 100}%`, top: `${(cy / 500) * 100}%` }}
        >
          <motion.span
            key={currentScore}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: animStage >= 1 ? 1 : 0, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {currentScore}
          </motion.span>
        </div>

        {sources.map((src) => {
          const v = vertices[src.id];
          const isLeft = src.id === "outside";
          const isBottom = src.id === "customer";
          return (
            <div
              key={src.id}
              className="v4-source-label"
              style={{
                left: `${(v.x / 600) * 100}%`,
                top: `${(v.y / 500) * 100}%`,
                transform: isBottom
                  ? "translate(-50%, 8px)"
                  : isLeft
                  ? "translate(-10%, -100%)"
                  : "translate(-90%, -100%)",
                textAlign: isBottom ? "center" : isLeft ? "left" : "right",
                alignItems: isBottom ? "center" : isLeft ? "flex-start" : "flex-end",
              }}
              onMouseEnter={() => setHovered(src.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <motion.div
                className="v4-source-label-inner"
                style={{ alignItems: isBottom ? "center" : isLeft ? "flex-start" : "flex-end" }}
                initial={{ opacity: 0, y: 8 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: src.delay + 0.25, duration: 0.5 }}
              >
                <span className="v4-source-label-tag">{src.label}</span>
                <motion.span
                  className="v4-source-label-desc"
                  animate={{ opacity: hovered === src.id ? 1 : 0.55 }}
                >
                  {src.desc}
                </motion.span>
              </motion.div>
            </div>
          );
        })}
      </div>

      <motion.p
        className="v4-source-caption"
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ delay: 3.2 }}
      >
        LIKELIHOOD OF SUCCESS
      </motion.p>
    </div>
  );
};

/* ──────────────────────── styles — updated design tokens ──────────────────────── */
const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400&display=swap');

    .v4-root {
      /* ── Design tokens (tokens.css) ── */
      --ink: #111;
      --ink-2: #555;
      --ink-3: #999;
      --line: #d9d9d9;
      --line-soft: #ededed;
      --paper: #fff;
      --page-bg: #efefec;
      --accent: #111;
      --highlight: rgba(255, 243, 196, 0.75);
      --ease: cubic-bezier(.2,.7,.2,1);
      --dur-micro: .2s;
      --dur-layer: .45s;
      --dur-commit: .9s;
      --font-sans: 'Inter', system-ui, sans-serif;
      --font-mono: 'JetBrains Mono', ui-monospace, monospace;

      position: fixed; inset: 0;
      display: flex; flex-direction: column;
      background: var(--page-bg);
      color: var(--ink);
      font-family: var(--font-sans);
      font-weight: 300;
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
    }
    .v4-root * { box-sizing: border-box; }
    .v4-root button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
    .v4-root a { color: inherit; text-decoration: none; }

    .v4-scroll {
      flex: 1; min-height: 0;
      overflow-y: auto; overflow-x: hidden;
      scroll-behavior: smooth;
    }

    /* ── HEADER ── */
    .v4-header-wrap {
      flex-shrink: 0;
      background: var(--page-bg);
      border-bottom: 1px solid var(--line);
      z-index: 50;
    }
    .v4-header {
      display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
      padding: 22px 36px;
    }
    .v4-mark-logo {
      justify-self: center;
      display: inline-flex; align-items: center;
      background: none; border: 0; padding: 8px; cursor: pointer;
    }
    .v4-logo-svg { height: 130px; width: auto; display: block; }
    .v4-logo-row-svg { height: 36px; width: auto; display: block; }
    .v4-dropcol-logo { margin-bottom: 10px; }
    .v4-nav {
      justify-self: end;
      display: flex; gap: 18px;
      font-family: var(--font-mono); font-size: 11px; letter-spacing: .18em; color: var(--ink-3);
    }
    .v4-nav a:hover { color: var(--ink); }
    .v4-nav-current { color: var(--ink); border-bottom: 1px solid var(--ink); padding-bottom: 2px; }

    /* ── DROPDOWN ── */
    .v4-dropdown {
      background: var(--paper);
      border-bottom: 1px solid var(--line); overflow: hidden;
    }
    .v4-dropdown-grid {
      max-width: 1280px; margin: 0 auto;
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
      padding: 32px 36px;
    }
    .v4-dropcol {
      padding: 0 28px;
      border-right: 1px solid var(--line-soft);
      display: flex; flex-direction: column; gap: 12px;
    }
    .v4-dropcol:first-child { padding-left: 0; }
    .v4-dropcol:last-child { padding-right: 0; border-right: 0; }
    .v4-dropcol-title {
      font-size: 18px; font-weight: 500; letter-spacing: -0.01em;
      margin: 0; color: var(--ink);
    }

    /* ── SECTIONS ── */
    .v4-sec {
      min-height: 100vh;
      display: flex; flex-direction: column; justify-content: center;
      padding: 80px 96px;
      max-width: 1280px; margin: 0 auto;
      position: relative;
    }
    .v4-sec-inner { max-width: 920px; }
    .v4-hero .v4-sec-inner { max-width: 1080px; }
    .v4-caption {
      font-family: var(--font-mono); font-size: 10px; letter-spacing: .18em;
      color: var(--ink-3); text-transform: uppercase; margin-bottom: 36px;
      padding-bottom: 14px; border-bottom: 1px solid var(--line);
      max-width: 920px;
    }

    /* ── TYPOGRAPHY ── */
    .v4-display {
      font-size: clamp(40px, 5.6vw, 72px); line-height: 1.05;
      letter-spacing: -0.025em; font-weight: 400;
      color: var(--ink); margin: 0; max-width: 1100px;
    }
    .v4-display-mark em {
      font-style: normal; font-weight: 500;
      background: var(--highlight); padding: 0 6px;
      box-decoration-break: clone; -webkit-box-decoration-break: clone;
    }
    .v4-h2 {
      font-size: clamp(30px, 3.4vw, 44px); line-height: 1.12;
      letter-spacing: -0.02em; font-weight: 400;
      color: var(--ink); margin: 0; max-width: 820px;
    }
    .v4-lead {
      font-size: clamp(20px, 1.7vw, 26px); line-height: 1.5;
      font-weight: 300; color: var(--ink); margin: 0; max-width: 820px;
    }
    .v4-body {
      font-size: 17px; line-height: 1.6;
      font-weight: 300; color: var(--ink-2); margin: 0; max-width: 720px;
    }
    .v4-italic { font-style: italic; color: var(--ink-2); }
    .v4-pull {
      font-size: clamp(28px, 3vw, 40px); line-height: 1.2;
      letter-spacing: -0.015em; font-weight: 400; color: var(--ink); margin: 0;
    }
    .v4-pull em {
      font-style: normal; font-weight: 500;
      background: var(--highlight); padding: 2px 8px;
      box-decoration-break: clone; -webkit-box-decoration-break: clone;
    }
    .v4-body em {
      font-style: normal; font-weight: 500;
      background: var(--highlight); padding: 0 4px;
    }

    .v4-mt-md { margin-top: 18px; }
    .v4-mt-lg { margin-top: 28px; }
    .v4-mt-xl { margin-top: 48px; }

    /* ── BUTTONS ── */
    .v4-cta-row { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; text-align: left; }
    .v4-root .v4-btn {
      position: relative;
      display: inline-flex; align-items: center; gap: 10px;
      font-family: var(--font-mono); font-size: 12px; font-weight: 500; letter-spacing: .16em;
      padding: 16px 24px;
      border: 1.5px solid var(--ink);
      border-radius: 0;
      color: var(--ink); background: transparent;
      cursor: pointer;
      -webkit-appearance: none; appearance: none;
      transition: background var(--dur-micro) var(--ease), color var(--dur-micro) var(--ease), transform var(--dur-micro) var(--ease);
      outline: none; text-decoration: none;
    }
    .v4-root .v4-btn .v4-btn-arrow {
      font-size: 14px; line-height: 1;
      transition: transform .25s var(--ease);
    }
    .v4-root .v4-btn:hover { background: var(--ink); color: var(--paper); }
    .v4-root .v4-btn:hover .v4-btn-arrow { transform: translateX(4px); }
    .v4-root .v4-btn:focus-visible {
      box-shadow: 0 0 0 2px var(--page-bg), 0 0 0 4px var(--ink);
    }
    .v4-root .v4-btn:active { transform: translateY(1px); }
    .v4-root .v4-btn-primary { background: transparent; color: var(--ink); border-color: var(--ink); }

    /* ── SCROLL HINT ── */
    .v4-scroll-hint {
      margin-top: 48px; display: flex; flex-direction: column;
      align-items: flex-start; gap: 6px;
      font-family: var(--font-mono); font-size: 10px; letter-spacing: .18em; color: var(--ink-3);
    }
    .v4-arrow-bounce { animation: v4Bounce 1.6s var(--ease) infinite; }
    @keyframes v4Bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(4px); }
    }

    /* ── GRID (clarity cards) ── */
    .v4-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0;
      border-top: 1px solid var(--line); border-left: 1px solid var(--line);
      max-width: 920px;
    }
    .v4-cell {
      padding: 32px 28px;
      border-right: 1px solid var(--line); border-bottom: 1px solid var(--line);
      background: var(--paper);
      display: flex; flex-direction: column; gap: 10px;
      transition: background .25s var(--ease);
    }
    .v4-cell:hover { background: #fffdf5; }
    .v4-cell-num {
      font-family: var(--font-mono); font-size: 10px; letter-spacing: .18em; color: var(--ink-3);
    }
    .v4-cell-head { font-size: 22px; font-weight: 500; letter-spacing: -0.01em; color: var(--ink); }
    .v4-cell-body { font-size: 15px; line-height: 1.55; color: var(--ink-2); font-weight: 300; }

    /* ── LIST ── */
    .v4-list {
      list-style: none; padding: 0; margin: 0;
      display: flex; flex-direction: column; gap: 10px; max-width: 680px;
    }
    .v4-list li {
      display: grid; grid-template-columns: 24px 1fr;
      align-items: baseline; gap: 8px;
      padding: 10px 0; border-bottom: 1px solid var(--line-soft);
      font-size: 18px; color: var(--ink); font-weight: 300;
    }
    .v4-list-mark {
      font-family: var(--font-mono); color: var(--ink-3); font-size: 14px;
    }

    /* ── STEPS ── */
    .v4-steps {
      display: flex; flex-direction: column; gap: 0;
      border-top: 1px solid var(--line); max-width: 720px;
    }
    .v4-step {
      display: grid; grid-template-columns: 60px 140px 1fr;
      align-items: center; gap: 16px;
      padding: 18px 0; border-bottom: 1px solid var(--line);
    }
    .v4-step-num {
      font-family: var(--font-mono); font-size: 10px; letter-spacing: .18em; color: var(--ink-3);
    }
    .v4-step-bold { font-size: 18px; font-weight: 500; color: var(--ink); }
    .v4-step-rest { font-size: 16px; color: var(--ink-2); font-weight: 300; }

    /* ── SOURCE DIAGRAM ── */
    .v4-source { width: 100%; max-width: 680px; display: flex; flex-direction: column; align-items: center; }
    .v4-source-frame { position: relative; width: 100%; }
    .v4-source-svg { width: 100%; height: 100%; display: block; }
    .v4-source-score {
      position: absolute; transform: translate(-50%, -50%);
      font-family: var(--font-sans); font-weight: 300;
      font-size: clamp(36px, 4vw, 52px); letter-spacing: -0.03em; color: var(--ink);
      display: flex; align-items: center; justify-content: center;
      pointer-events: none;
    }
    .v4-source-label { position: absolute; cursor: default; display: flex; }
    .v4-source-label-inner { display: flex; flex-direction: column; gap: 4px; max-width: 180px; }
    .v4-source-label-tag {
      font-family: var(--font-mono); font-size: 10px; letter-spacing: .18em; color: var(--ink);
    }
    .v4-source-label-desc {
      font-family: var(--font-sans); font-size: 12px; line-height: 1.4;
      color: var(--ink-2); font-weight: 300;
      transition: opacity .25s var(--ease);
    }
    .v4-source-caption {
      margin-top: 18px;
      font-family: var(--font-mono); font-size: 10px; letter-spacing: .3em; color: var(--ink-3);
    }

    /* ── FOOTER ── */
    .v4-footer {
      padding: 40px 96px 60px;
      border-top: 1px solid var(--line);
      background: var(--page-bg);
      max-width: 1280px; margin: 0 auto;
    }
    .v4-footer-row {
      display: flex; justify-content: space-between; align-items: center;
      font-family: var(--font-mono); font-size: 10px; letter-spacing: .18em; color: var(--ink-3);
    }
    .v4-footer-links {
      display: flex; gap: 24px; margin-top: 14px;
      font-family: var(--font-mono); font-size: 10px; letter-spacing: .18em; color: var(--ink-3);
    }
    .v4-footer-links a:hover { color: var(--ink); }

    /* ── QUIZ OVERLAY ── */
    .v4-quiz-scrim {
      position: fixed; inset: 0; z-index: 70; background: rgba(17,17,17,.4);
    }
    .v4-quiz-panel {
      position: fixed; inset-inline: 0; bottom: 0; z-index: 80; max-height: 92vh;
      background: var(--paper); border-top: 2px solid var(--ink);
      box-shadow: 0 -20px 60px rgba(0,0,0,.15);
    }
    .v4-quiz-inner { max-height: 92vh; overflow-y: auto; overscroll-behavior: contain; }

    /* ── RESPONSIVE ── */
    @media (max-width: 900px) {
      .v4-header { grid-template-columns: 1fr auto; padding: 16px 20px; gap: 12px; }
      .v4-mark-trigger { display: none; }
      .v4-dropdown-grid { grid-template-columns: 1fr; padding: 24px 20px; gap: 24px; }
      .v4-dropcol { padding: 0; border-right: 0; border-bottom: 1px solid var(--line-soft); padding-bottom: 18px; }
      .v4-dropcol:last-child { border-bottom: 0; padding-bottom: 0; }
      .v4-sec { padding: 64px 20px; }
      .v4-grid { grid-template-columns: 1fr; }
      .v4-step { grid-template-columns: 50px 1fr; }
      .v4-step-rest { grid-column: 1 / -1; padding-left: 50px; }
      .v4-footer { padding: 32px 20px 48px; }
      .v4-footer-row { flex-direction: column; align-items: flex-start; gap: 8px; }
    }
  `}</style>
);

export default LandingPage4;
