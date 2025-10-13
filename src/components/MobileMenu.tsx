
import React, { useState, useEffect } from 'react';
import { Menu, X, Rocket, Atom, Wind } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MobileMenu = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [isOpen]);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const menuVariants = {
    hidden: {
      x: '100%',
      opacity: 0,
    },
    visible: {
      x: 0,
      opacity: 1,
      transition: {
        type: 'tween',
        duration: 0.3,
        ease: 'easeOut',
      },
    },
    exit: {
      x: '100%',
      opacity: 0,
      transition: {
        type: 'tween',
        duration: 0.3,
        ease: 'easeIn',
      },
    },
  };

  return (
    <div className="md:hidden">
      <button onClick={toggleMenu} className="p-2 rounded-md" aria-label="Open menu">
        <Menu size={24} className="dark:text-white" />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={menuVariants}
            className="fixed inset-0 bg-white dark:bg-gray-900 z-50 p-4"
          >
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center space-x-2">
                <Rocket className="text-blue-500" size={28} />
                <span className="font-bold text-xl dark:text-white">AstroProject</span>
              </div>
              <button onClick={toggleMenu} className="p-2 rounded-md" aria-label="Close menu">
                <X size={24} className="dark:text-white" />
              </button>
            </div>
            <nav className="flex flex-col space-y-4">
              <a href="#" className="px-3 py-2 rounded-md text-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-white">Home</a>
              <a href="#" className="px-3 py-2 rounded-md text-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-white">About</a>
              <a href="#" className="px-3 py-2 rounded-md text-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-white">Services</a>
              <a href="#" className="px-3 py-2 rounded-md text-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-white">Contact</a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MobileMenu;
