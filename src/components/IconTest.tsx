import React from 'react';
import { Sun, Moon, Heart } from 'lucide-react';

const IconTest = () => {
  return (
    <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-lg">
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">React Component Icon Test</h2>
      <div className="flex justify-around">
        <div className="flex flex-col items-center">
          <Sun className="text-gray-900 dark:text-white" size={32} />
          <span className="mt-2 text-gray-700 dark:text-gray-300">Sun</span>
        </div>
        <div className="flex flex-col items-center">
          <Moon className="text-gray-900 dark:text-white" size={32} />
          <span className="mt-2 text-gray-700 dark:text-gray-300">Moon</span>
        </div>
        <div className="flex flex-col items-center">
          <Heart className="text-red-500" size={32} />
          <span className="mt-2 text-gray-700 dark:text-gray-300">Heart</span>
        </div>
      </div>
    </div>
  );
};

export default IconTest;